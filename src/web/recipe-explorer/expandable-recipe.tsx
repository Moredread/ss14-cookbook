import {
  ReactElement,
  memo,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useGameData } from '../context';
import { DropdownIcon } from '../icons';
import { Recipe } from '../recipe';
import { compareByName } from '../sort';
import {
  RelationDirection,
  getDownstreamRecipes,
  getUpstreamRecipes,
} from './relations';

export interface ExpandableRecipeProps {
  id: string;
  direction: RelationDirection;
  ancestors: ReadonlySet<string>;
  depth: number;
  onExpansionChange: (delta: number) => void;
}

export const ExpandableRecipe = memo(({
  id,
  direction,
  ancestors,
  depth,
  onExpansionChange,
}: ExpandableRecipeProps): ReactElement => {
  const {
    recipeMap,
    recipesBySolidResult,
    recipesBySolidIngredient,
    recipesByReagentResult,
    recipesByReagentIngredient,
    entityMap,
    reagentMap,
  } = useGameData();

  const isCycle = ancestors.has(id);

  const recipe = recipeMap.get(id);

  const related: readonly string[] = useMemo(() => {
    if (isCycle || !recipe) {
      return [];
    }
    const compare = compareByName(entityMap, reagentMap);
    const compareRecipes = (a: string, b: string): number => {
      const recipeA = recipeMap.get(a);
      const recipeB = recipeMap.get(b);
      if (!recipeA || !recipeB) return 0;
      return compare(recipeA, recipeB);
    };

    if (direction === 'upstream') {
      return getUpstreamRecipes(recipe, recipesBySolidResult, recipesByReagentResult)
        .sort(compareRecipes);
    }
    return getDownstreamRecipes(recipe, recipesBySolidIngredient, recipesByReagentIngredient)
      .sort(compareRecipes);
  }, [
    id, isCycle, recipe, direction,
    recipeMap, entityMap, reagentMap,
    recipesBySolidResult, recipesByReagentResult,
    recipesBySolidIngredient, recipesByReagentIngredient,
  ]);

  const hasRelated = related.length > 0;
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded(prev => {
      onExpansionChange(prev ? -1 : 1);
      return !prev;
    });
  }, [onExpansionChange]);

  const childAncestors = useMemo(
    () => new Set([...ancestors, id]),
    [ancestors, id]
  );

  const dirClass = direction === 'upstream' ? 'before' : 'after';
  const arrowLabel = direction === 'upstream' ? 'Made with' : 'Used in';

  let className = 'explorer_expandable';
  if (isCycle) className += ' explorer_expandable--cycle';
  if (expanded && hasRelated) className += ' explorer_expandable--expanded';

  return (
    <div className={className}>
      <div className='explorer_expandable-header'>
        {hasRelated && !isCycle &&
          <button
            className={expanded ? 'explorer_expand-toggle' : 'explorer_expand-toggle explorer_expand-toggle--collapsed'}
            onClick={toggle}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
          >
            <DropdownIcon size={16}/>
          </button>
        }
        <Recipe id={id} skipDefaultHeaderAction/>
      </div>
      {expanded && hasRelated && <>
        <div className={`explorer_arrow explorer_arrow--${dirClass} explorer_arrow--current`}>
          <span className='explorer_arrow-label'>{arrowLabel}</span>
        </div>
        <div className={`explorer_list explorer_list--${dirClass}`}>
          <div className='explorer_list-inner'>
            {related.map(childId =>
              <ExpandableRecipe
                key={childId}
                id={childId}
                direction={direction}
                ancestors={childAncestors}
                depth={depth + 1}
                onExpansionChange={onExpansionChange}
              />
            )}
          </div>
        </div>
      </>}
    </div>
  );
});
