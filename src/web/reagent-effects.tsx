import { ReactElement, memo } from 'react';
import {
  MetabolismGroup,
  ReagentEffect,
  ReagentEffectCondition,
  ReagentMetabolisms,
} from '../types';
import { useGameData } from './context';

export interface ReagentEffectsProps {
  metabolisms: ReagentMetabolisms;
}

export const ReagentEffects = memo(({
  metabolisms,
}: ReagentEffectsProps): ReactElement => {
  const groups = Object.entries(metabolisms);

  return (
    <div className='reagent-effects'>
      {groups.map(([groupName, group]) =>
        <MetabolismGroupView
          key={groupName}
          name={groupName}
          group={group}
        />
      )}
    </div>
  );
});

interface MetabolismGroupViewProps {
  name: string;
  group: MetabolismGroup;
}

const MetabolismGroupView = ({
  name,
  group,
}: MetabolismGroupViewProps): ReactElement => {
  const { reagentMap } = useGameData();

  return (
    <div className='reagent-effects_group'>
      <span className='reagent-effects_group-name'>{name}</span>
      {group.metabolismRate != null && (
        <span className='reagent-effects_rate'>
          Rate: {group.metabolismRate}u/s
        </span>
      )}
      {group.metabolites && Object.keys(group.metabolites).length > 0 && (
        <div className='reagent-effects_metabolites'>
          Metabolites:{' '}
          {Object.entries(group.metabolites).map(([id, ratio], i) => {
            const reagent = reagentMap.get(id);
            return (
              <span key={id}>
                {i > 0 && ', '}
                <span
                  className='reagent-effects_metabolite'
                  style={{ color: reagent?.color }}
                >
                  {reagent?.name ?? id}
                </span>
                {' '}({ratio})
              </span>
            );
          })}
        </div>
      )}
      {group.effects && group.effects.length > 0 && (
        <ul className='reagent-effects_list'>
          {group.effects.map((effect, i) =>
            <li key={i} className='reagent-effects_effect'>
              {describeEffect(effect)}
              {effect.probability != null && effect.probability < 1 && (
                <span className='reagent-effects_prob'>
                  {' '}({Math.round(effect.probability * 100)}%)
                </span>
              )}
              {effect.conditions && effect.conditions.length > 0 && (
                <span className='reagent-effects_conditions'>
                  {' '}if {effect.conditions.map((c, j) =>
                    <span key={j}>
                      {j > 0 && ' and '}
                      {describeCondition(c)}
                    </span>
                  )}
                </span>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

interface DamageGroup {
  [key: string]: number;
}

const describeEffect = (effect: ReagentEffect): string => {
  switch (effect.type) {
    case 'SatiateHunger':
      return effect.factor
        ? `Satiates hunger (\u00d7${effect.factor})`
        : 'Satiates hunger';
    case 'SatiateThirst':
      return effect.factor
        ? `Quenches thirst (\u00d7${effect.factor})`
        : 'Quenches thirst';
    case 'Drunk':
      return effect.boozePower
        ? `Causes drunkenness (\u00d7${effect.boozePower})`
        : 'Causes drunkenness';
    case 'Vomit':
      return 'May cause vomiting';
    case 'Jitter':
      return 'Causes jittering';
    case 'PopupMessage':
      return 'Causes nausea';
    case 'HealthChange':
    case 'EvenHealthChange':
      return describeHealthChange(effect);
    case 'ModifyBleed':
      return (effect.amount as number) < 0
        ? `Reduces bleeding (${effect.amount})`
        : `Increases bleeding (+${effect.amount})`;
    case 'ModifyBloodLevel':
      return (effect.amount as number) > 0
        ? `Restores blood (+${effect.amount})`
        : `Reduces blood (${effect.amount})`;
    case 'ModifyStatusEffect': {
      const action = effect.typeValue === 'Remove' ? 'Removes' : 'Applies';
      const proto = String(effect.effectProto ?? '');
      const name = proto.replace(/^StatusEffect/, '');
      return `${action} ${name}`;
    }
    case 'MovementSpeedModifier': {
      const walk = effect.walkSpeedModifier as number | undefined;
      const sprint = effect.sprintSpeedModifier as number | undefined;
      if (walk != null && sprint != null) {
        return `Speed \u00d7${sprint}`;
      }
      return 'Modifies speed';
    }
    case 'AdjustReagent': {
      const reagent = effect.reagent as string | undefined;
      const amount = effect.amount as number | undefined;
      if (reagent && amount != null) {
        return amount > 0
          ? `Adds ${amount}u ${reagent}`
          : `Removes ${-amount}u ${reagent}`;
      }
      return 'Adjusts reagent';
    }
    case 'Emote':
      return `Emote: ${effect.emote ?? 'unknown'}`;
    case 'ChemVomit':
      return 'Causes vomiting';
    case 'Electrocute':
      return 'Causes electrocution';
    case 'FlammableReaction':
      return 'Makes flammable';
    case 'ActivateArtifact':
      return 'Activates artifact';
    case 'Paralyze':
      return 'Causes paralysis';
    case 'CureZombieInfection':
      return 'Cures zombie infection';
    case 'CreateGas':
      return `Creates gas: ${effect.gas ?? 'unknown'}`;
    case 'Ignite':
      return 'Ignites';
    case 'Extinguish':
      return 'Extinguishes';
    case 'GenericStatusEffect':
      return `Applies ${effect.key ?? 'status effect'}`;
    default:
      return effect.type;
  }
};

const describeHealthChange = (effect: ReagentEffect): string => {
  const damage = effect.damage as Record<string, unknown> | undefined;
  if (!damage || typeof damage !== 'object') return 'Changes health';

  const parts: string[] = [];

  // Flat format: { Brute: -0.5, Burn: -0.5 }
  // Nested format: { types: { Poison: 0.1 } } or { groups: { ... } }
  let types: Record<string, unknown>;
  if ('types' in damage && typeof damage.types === 'object' && damage.types) {
    types = damage.types as Record<string, unknown>;
  } else if ('groups' in damage && typeof damage.groups === 'object' && damage.groups) {
    types = damage.groups as Record<string, unknown>;
  } else {
    types = damage;
  }

  for (const [dmgType, amount] of Object.entries(types)) {
    if (typeof amount !== 'number') continue;
    if (amount < 0) {
      parts.push(`Heals ${-amount} ${dmgType}`);
    } else {
      parts.push(`Deals ${amount} ${dmgType}`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'Changes health';
};

const describeCondition = (cond: ReagentEffectCondition): string => {
  switch (cond.type) {
    case 'ReagentCondition': {
      const reagent = cond.reagent as string | undefined;
      const min = cond.min as number | undefined;
      const max = cond.max as number | undefined;
      if (reagent) {
        if (min != null && max != null) {
          return `${min}\u2013${max}u ${reagent}`;
        }
        if (min != null) {
          return `\u2265${min}u ${reagent}`;
        }
        if (max != null) {
          return `\u2264${max}u ${reagent}`;
        }
      }
      return 'reagent condition';
    }
    case 'MetabolizerTypeCondition': {
      const types = cond.typeValue as string[] | undefined;
      const inverted = cond.inverted as boolean | undefined;
      const label = types?.join(', ') ?? 'unknown';
      return inverted ? `not ${label}` : `${label} only`;
    }
    case 'OrganType': {
      const orgType = cond.typeValue as string | undefined;
      return orgType ? `organ: ${orgType}` : 'organ condition';
    }
    default:
      return cond.type;
  }
};
