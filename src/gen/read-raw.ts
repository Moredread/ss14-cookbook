import { globSync } from 'glob';
import { resolve } from 'node:path';
import { CollectionTag, ScalarTag, Scalar, YAMLMap, parse } from 'yaml';
import { readFileTextWithoutTheStupidBOM } from './helpers';
import {
  ConstructionGraphId,
  ConstructionGraphMap,
  ConstructionGraphPrototype,
  ConstructionId,
  ConstructionMap,
  ConstructionPrototype,
  EntityId,
  EntityMap,
  EntityPrototype,
  FoodSequenceElementId,
  FoodSequenceElementMap,
  FoodSequenceElementPrototype,
  MetamorphRecipeId,
  MetamorphRecipeMap,
  MetamorphRecipePrototype,
  MicrowaveMealRecipe,
  ReactionPrototype,
  ReagentId,
  ReagentMap,
  ReagentPrototype,
  RelevantPrototypeRegex,
  StackId,
  StackMap,
  StackPrototype,
  isRelevantPrototype,
} from './prototypes';

export interface RawGameData {
  readonly entities: EntityMap;
  readonly reagents: ReagentMap;
  readonly stacks: StackMap;
  readonly constructionGraphs: ConstructionGraphMap;
  readonly constructions: ConstructionMap;
  readonly metamorphRecipes: MetamorphRecipeMap;
  readonly foodSequenceElements: FoodSequenceElementMap;
  readonly recipes: readonly MicrowaveMealRecipe[];
  readonly reactions: readonly ReactionPrototype[];
}

// SS14 uses `!type:T` tags to create values of type `T`.
// The yaml library we're using provides no way to create tags dynamically,
// hence we have to specify all *relevant* type tags ourselves.
// We implement `!type:T` tags by assigning 'T' to the object's '!type' key.

const typeMapTag = (name: string): CollectionTag => ({
  tag: `!type:${name}`,
  collection: 'map',
  identify: () => false,
  resolve(value) {
    if (!(value instanceof YAMLMap)) {
      throw new Error(`Expected YAMLMap, got ${value}`);
    }
    value.add({
      key: new Scalar('!type') as Scalar.Parsed,
      value: new Scalar(name) as Scalar.Parsed,
    });
  },
});

// Handles `!type:Foo` when used with no fields (parsed as a scalar, not a map).
const typeScalarTag = (name: string): ScalarTag => ({
  tag: `!type:${name}`,
  identify: () => false,
  resolve: () => ({ '!type': name }),
});

type CustomTag = CollectionTag | ScalarTag;

const mapTagCache = new Map<string, CollectionTag>();
const scalarTagCache = new Map<string, ScalarTag>();

const getOrCreateTags = (name: string): [CollectionTag, ScalarTag] => {
  let mapTag = mapTagCache.get(name);
  if (!mapTag) {
    mapTag = typeMapTag(name);
    mapTagCache.set(name, mapTag);
  }
  let scalarTag = scalarTagCache.get(name);
  if (!scalarTag) {
    scalarTag = typeScalarTag(name);
    scalarTagCache.set(name, scalarTag);
  }
  return [mapTag, scalarTag];
};

const discoverTags = (source: string): CustomTag[] => {
  const tags: CustomTag[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(/!type:(\w+)/g)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      tags.push(...getOrCreateTags(match[1]));
    }
  }
  return tags;
};

export const findResourceFiles = (prototypeDir: string): string[] =>
  globSync('**/*.yml', { cwd: prototypeDir })
    .map(filePath => resolve(prototypeDir, filePath))

export const readRawGameData = (yamlPaths: string[]): RawGameData => {
  const entities = new Map<EntityId, EntityPrototype>();
  const reagents = new Map<ReagentId, ReagentPrototype>();
  const stacks = new Map<StackId, StackPrototype>();
  const constructionGraphs = new Map<ConstructionGraphId, ConstructionGraphPrototype>();
  const constructions = new Map<ConstructionId, ConstructionPrototype>();
  const metamorphRecipes = new Map<MetamorphRecipeId, MetamorphRecipePrototype>();
  const foodSequenceElements = new Map<FoodSequenceElementId, FoodSequenceElementPrototype>();
  const recipes: MicrowaveMealRecipe[] = [];
  const reactions: ReactionPrototype[] = [];

  for (const path of yamlPaths) {
    const source = readFileTextWithoutTheStupidBOM(path);

    if (!RelevantPrototypeRegex.test(source)) {
      // The file does not seem to contain anything relevant, skip it
      continue;
    }

    const doc = parse(source, {
      customTags: discoverTags(source),
    });

    if (!Array.isArray(doc)) {
      // Top-level structure should be an array
      console.warn(`${path}: top-level structure is not an array, ignoring`);
      continue;
    }

    for (const node of doc) {
      if (!isRelevantPrototype(node)) {
        continue;
      }
      switch (node.type) {
        case 'entity':
          entities.set(node.id, node);
          break;
        case 'foodSequenceElement':
          foodSequenceElements.set(node.id, node);
          break;
        case 'reagent':
          reagents.set(node.id, node);
          break;
        case 'stack':
          stacks.set(node.id, node);
          break;
        case 'construction':
          constructions.set(node.id, node);
          break;
        case 'constructionGraph':
          constructionGraphs.set(node.id, node);
          break;
        case 'metamorphRecipe':
          metamorphRecipes.set(node.id, node);
          break;
        case 'microwaveMealRecipe':
          recipes.push(node);
          break;
        case 'reaction':
          reactions.push(node);
          break;
      }
    }
  }
  // Resolve inherited group field through parent chains
  for (const reagent of reagents.values()) {
    if (reagent.group || !reagent.parent) continue;
    let current = reagent;
    while (!current.group && current.parent) {
      const parent = reagents.get(current.parent);
      if (!parent) break;
      current = parent;
    }
    if (current.group) {
      (reagent as any).group = current.group;
    }
  }

  // Resolve inherited metabolisms through parent chains
  for (const reagent of reagents.values()) {
    if (reagent.metabolisms || !reagent.parent) continue;
    let current: ReagentPrototype | undefined = reagent;
    while (current && !current.metabolisms && current.parent) {
      current = reagents.get(current.parent);
    }
    if (current?.metabolisms) {
      (reagent as any).metabolisms = current.metabolisms;
    }
  }

  return {
    entities,
    reagents,
    stacks,
    constructionGraphs,
    constructions,
    metamorphRecipes,
    foodSequenceElements,
    recipes,
    reactions,
  };
};
