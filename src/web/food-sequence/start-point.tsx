import { ReactElement, memo, useMemo } from 'react';
import { Entity } from '../../types';
import { useGameData } from '../context';
import { NeutralCollator } from '../helpers';
import { RecipePopup } from '../recipe-popup';
import { EntitySprite } from '../sprites';

export interface SeqStartPointProps {
  entity: Entity;
}

export const SeqStartPoint = memo(({
  entity,
}: SeqStartPointProps): ReactElement => {
  const {
    recipesBySolidResult,
    foodSequenceElements,
    foodSequenceEndPoints,
    entityMap,
  } = useGameData();

  const startRecipe = recipesBySolidResult.get(entity.id);

  const seqStart = entity.seqStart!;
  const elements = useMemo(() => {
    return (foodSequenceElements.get(seqStart.key) ?? [])
      .slice(0)
      .sort((a, b) => {
        const nameA = entityMap.get(a)?.name ?? a;
        const nameB = entityMap.get(b)?.name ?? b;
        return NeutralCollator.compare(nameA, nameB);
      });
  }, [seqStart, foodSequenceElements, entityMap]);
  const endPoints = useMemo(() => {
    return foodSequenceEndPoints.get(seqStart.key)
      ?.slice(0)
      .sort((a, b) => {
        const nameA = entityMap.get(a)?.name ?? a;
        const nameB = entityMap.get(b)?.name ?? b;
        return NeutralCollator.compare(nameA, nameB);
      });
  }, [seqStart, foodSequenceEndPoints, entityMap]);

  return <>
    <p className='foodseq_start'>
      <strong>
        <EntitySprite id={entity.id}/>
        {startRecipe ? (
          <RecipePopup id={startRecipe}>
            <span className='more-info'>{entity.name}</span>
          </RecipePopup>
        ) : entity.name}
      </strong>
      {` accepts up to ${seqStart.maxCount} of:`}
    </p>
    <ul className='foodseq_elements'>
      {elements.map(id => <SeqElement key={id} id={id}/>)}
    </ul>

    {endPoints && endPoints.length > 0 && <>
      <p>and can be finished with one of:</p>
      <ul className='foodseq_elements'>
        {endPoints.map(id => <SeqElement key={id} id={id}/>)}
      </ul>
    </>}
  </>;
});

interface SeqElementProps {
  id: string;
}

const SeqElement = ({ id }: SeqElementProps): ReactElement => {
  const { recipesBySolidResult, entityMap } = useGameData();

  const entity = entityMap.get(id);
  const name = entity?.name ?? id;
  const recipe = recipesBySolidResult.get(id);

  return (
    <li className='foodseq_element' data-entity-id={id}>
      <EntitySprite id={id}/>
      {recipe ? (
        <RecipePopup id={recipe}>
          <span className='more-info'>{name}</span>
        </RecipePopup>
      ) : <span>{name}</span>}
    </li>
  );
};
