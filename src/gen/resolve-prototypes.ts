import { FluentBundle, FluentResource } from '@fluent/bundle';
import { globSync } from 'glob';
import { resolve } from 'node:path';
import {
  CookingMethod,
  MetabolismGroup,
  ReagentEffect,
  ReagentEffectCondition,
  ReagentMetabolisms,
} from '../types';
import {
  DefaultCookTime,
  DefaultRecipeGroup,
  MixerCategoryToStepType,
} from './constants';
import { ConstructRecipeBuilder } from './construct-recipe-builder';
import { PrunedGameData } from './filter-relevant';
import { readFileTextWithoutTheStupidBOM } from './helpers';
import { isPlainObject } from './types';
import {
  EntityId,
  MicrowaveMealRecipe,
  Reactant,
  ReactionPrototype,
  ReagentId,
  ReagentMap,
} from './prototypes';
import { getReagentResult, getSolidResult } from './reaction-helpers';
import {
  MethodEntities,
  MicrowaveRecipeTypes,
  ResolvedEntity,
  ResolvedEntityMap,
  ResolvedReagent,
  ResolvedReagentMap,
  ResolvedRecipe,
} from './types';

export interface ResolvedGameData {
  readonly entities: ResolvedEntityMap;
  readonly reagents: ResolvedReagentMap;
  readonly recipes: ReadonlyMap<string, ResolvedRecipe>;
  readonly reagentSources: ReadonlyMap<ReagentId, readonly EntityId[]>;
  readonly methodEntities: ReadonlyMap<CookingMethod, ResolvedEntity>;
  /** Frontier */
  readonly microwaveRecipeTypeEntities: ReadonlyMap<string, ResolvedEntity> | undefined;
}

export const resolvePrototypes = (
  filtered: PrunedGameData,
  allEntities: ResolvedEntityMap,
  localeDir: string,
  methodEntities: MethodEntities,
  microwaveRecipeTypes: MicrowaveRecipeTypes | undefined
): ResolvedGameData => {
  const reagents = new Map<ReagentId, ResolvedReagent>();
  const recipes = new Map<string, ResolvedRecipe>();

  const fluentBundle = createFluentBundle(localeDir);

  const defaultMicrowaveRecipeType = microwaveRecipeTypes &&
    Object.entries(microwaveRecipeTypes)
      .find(([k, v]) => v.default)
      ?.[0];

  for (const recipe of filtered.recipes) {
    recipes.set(recipe.id, {
      method: 'microwave',
      time: recipe.time ?? DefaultCookTime,
      solidResult: recipe.result,
      reagentResult: null,
      resultQty: recipe.resultCount, // Frontier
      solids: recipe.solids ?? {},
      reagents: recipe.reagents
        ? convertMicrowaveReagents(recipe.reagents)
        : {},
      subtype: resolveRecipeSubtype(recipe, defaultMicrowaveRecipeType),
      group: recipe.group ?? DefaultRecipeGroup,
    });
  }

  for (const [id, recipe] of filtered.specialRecipes) {
    // Localize construction category keys (e.g. "construction-category-weapons" → "Weapons")
    if (id.startsWith('craft!') && recipe.group.startsWith('construction-category-')) {
      const msg = fluentBundle.getMessage(recipe.group);
      const localizedGroup = msg?.value
        ? fluentBundle.formatPattern(msg.value)
        : recipe.group;
      recipes.set(id, { ...recipe, group: localizedGroup });
    } else {
      recipes.set(id, recipe);
    }
  }

  for (const [id, recipe] of reactionRecipes(filtered.reactions, filtered.reagents)) {
    recipes.set(id, recipe);
  }

  for (const reagent of filtered.reagents.values()) {
    const nameMessage = fluentBundle.getMessage(reagent.name);
    const name = nameMessage?.value
      ? fluentBundle.formatPattern(nameMessage.value)
      : reagent.id;
    const metabolisms = transformMetabolisms(reagent.metabolisms);
    reagents.set(reagent.id, {
      name,
      color: reagent.color ?? '#ffffff',
      ...(metabolisms ? { metabolisms } : {}),
    });
  }

  const resolvedMethodEntities = new Map<CookingMethod, ResolvedEntity>();
  for (const [method, id] of Object.entries(methodEntities)) {
    if (id === null) {
      // Unsupported cooking method on this fork, skip it.
      continue;
    }
    resolvedMethodEntities.set(
      method as CookingMethod,
      allEntities.get(id)!
    );
  }

  let microwaveRecipeTypeEntities: Map<string, ResolvedEntity> | undefined;
  if (microwaveRecipeTypes) {
    microwaveRecipeTypeEntities = new Map<string, ResolvedEntity>();
    for (const [subtype, subtypeData] of Object.entries(microwaveRecipeTypes)) {
      microwaveRecipeTypeEntities.set(
        subtype,
        allEntities.get(subtypeData.machine)!
      );
    }
  }

  return {
    entities: filtered.entities,
    reagents,
    recipes,
    reagentSources: filtered.reagentSources,
    methodEntities: resolvedMethodEntities,
    microwaveRecipeTypeEntities,
  };
};

const resolveRecipeSubtype = (
  recipe: MicrowaveMealRecipe,
  defaultSubtype: string | undefined
): string | readonly string[] | undefined => {
  const subtype = recipe.recipeType;
  if (Array.isArray(subtype)) {
    switch (subtype.length) {
      case 0:
        return defaultSubtype;
      case 1:
        return subtype[0];
      default:
        return subtype;
    }
  }
  return subtype ?? defaultSubtype;
};

const createFluentBundle = (localeDir: string): FluentBundle => {
  const ftlPaths =
    globSync('*/**/*.ftl', { cwd: localeDir })
      .map(filePath => resolve(localeDir, filePath))

  const bundle = new FluentBundle('en-US', {
    useIsolating: false,
  });

  for (const path of ftlPaths) {
    const source = readFileTextWithoutTheStupidBOM(path);
    const resource = new FluentResource(source);
    bundle.addResource(resource);
  }

  return bundle;
};

const convertMicrowaveReagents = (
  reagents: Readonly<Record<string, number>>
): Record<string, Reactant> => {
  const result: Record<string, Reactant> = {};
  for (const [id, amount] of Object.entries(reagents)) {
    result[id] = { amount };
  }
  return result;
};

function* reactionRecipes(
  reactions: readonly ReactionPrototype[],
  reagents: ReagentMap
): Generator<[string, ResolvedRecipe]> {
  for (const reaction of reactions) {
    const reagentResult = getReagentResult(reaction);
    const solidResult = getSolidResult(reaction);
    // Add an arbitrary prefix to prevent collisions.
    const id = `r!${reaction.id}`;

    const group = reagentResult
      ? (reagents.get(reagentResult[0])?.group ?? DefaultRecipeGroup)
      : DefaultRecipeGroup;

    if (
      reaction.requiredMixerCategories &&
      reaction.requiredMixerCategories.length > 0
    ) {
      for (const category of reaction.requiredMixerCategories) {
        const type = MixerCategoryToStepType.get(category);
        if (!type) {
          continue;
        }

        const recipe = new ConstructRecipeBuilder(group);
        if (reagentResult) {
          recipe
            .withReagentResult(reagentResult[0])
            .withResultQty(reagentResult[1]);
        } else {
          recipe.withSolidResult(solidResult!);
        }

        recipe.mix(reaction.reactants);
        if (reaction.minTemp) {
          recipe.heatMixture(reaction.minTemp, reaction.maxTemp);
        }
        recipe.pushStep({ type });

        yield [`${id}:${type}`, recipe.toRecipe()];
      }
    } else {
      yield [id, {
        method: 'mix',
        solidResult,
        reagentResult: reagentResult?.[0] ?? null,
        resultQty: reagentResult?.[1] ?? 1,
        minTemp: reaction.minTemp ?? 0,
        maxTemp: reaction.maxTemp && isFinite(reaction.maxTemp)
          ? reaction.maxTemp
          : null,
        reagents: reaction.reactants,
        solids: {},
        group,
      }];
    }
  }
}

const transformMetabolisms = (
  raw: Readonly<Record<string, unknown>> | undefined
): ReagentMetabolisms | undefined => {
  if (!raw) return undefined;

  const result: Record<string, MetabolismGroup> = {};
  let hasAny = false;

  for (const [groupName, groupData] of Object.entries(raw)) {
    if (!isPlainObject(groupData)) continue;

    const group: MetabolismGroup = {
      ...(typeof groupData.metabolismRate === 'number'
        ? { metabolismRate: groupData.metabolismRate }
        : {}),
      ...(isPlainObject(groupData.metabolites)
        ? { metabolites: groupData.metabolites as Record<string, number> }
        : {}),
      ...(Array.isArray(groupData.effects)
        ? { effects: transformEffects(groupData.effects) }
        : {}),
    };
    result[groupName] = group;
    hasAny = true;
  }

  return hasAny ? result : undefined;
};

/**
 * Copy all YAML fields from a `!type:`-tagged object, renaming `!type` to
 * `type`. If the original object also has a `type` field (e.g.
 * MetabolizerTypeCondition.type or ModifyStatusEffect.type), it's stored
 * under `typeValue` to avoid a collision with the C# class name.
 */
const renameTypedObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const typeName = obj['!type'];
  if (typeof typeName !== 'string') return obj;

  const out: Record<string, unknown> = { type: typeName };
  for (const [key, value] of Object.entries(obj)) {
    if (key === '!type') continue;
    out[key === 'type' ? 'typeValue' : key] = value;
  }
  return out;
};

const transformEffects = (effects: unknown[]): ReagentEffect[] => {
  const result: ReagentEffect[] = [];
  for (const effect of effects) {
    if (!isPlainObject(effect)) continue;
    if (typeof effect['!type'] !== 'string') continue;

    const transformed = renameTypedObject(effect);
    if (Array.isArray(transformed.conditions)) {
      transformed.conditions = transformConditions(transformed.conditions);
    }
    result.push(transformed as ReagentEffect);
  }
  return result;
};

const transformConditions = (conditions: unknown[]): ReagentEffectCondition[] => {
  const result: ReagentEffectCondition[] = [];
  for (const condition of conditions) {
    if (!isPlainObject(condition)) continue;
    if (typeof condition['!type'] !== 'string') continue;
    result.push(renameTypedObject(condition) as ReagentEffectCondition);
  }
  return result;
};
