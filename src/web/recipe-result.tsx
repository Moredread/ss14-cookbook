import { ReactElement, Ref, cloneElement, memo } from 'react';
import { createPortal } from 'react-dom';
import { Recipe, ResultReagent } from '../types';
import { useGameData } from './context';
import { getPopupRoot, usePopupTrigger } from './popup-impl';
import { hasInterestingEffects, ReagentEffects } from './reagent-effects';
import { useSettings } from './settings';
import { EntitySprite, ReagentSprite } from './sprites';
import { Tooltip } from './tooltip';

export interface RecipeResultProps {
  recipe: Recipe;
}

export const RecipeResult = memo(({
  recipe,
}: RecipeResultProps): ReactElement => {
  const { entityMap, reagentMap } = useGameData();
  const [{ showBoringEffects }] = useSettings();

  const solidResult = recipe.solidResult
    ? entityMap.get(recipe.solidResult)
    : undefined;
  const reagentResult = recipe.reagentResult
    ? reagentMap.get(recipe.reagentResult)
    : undefined;
  const resultQty = recipe.resultQty ?? 1;

  const hasEffects = recipe.resultReagents?.some(r =>
    r.metabolisms && (showBoringEffects || hasInterestingEffects(r.metabolisms))
  );

  if (solidResult) {
    return (
      <span className='recipe_result'>
        <EntitySprite id={solidResult.id}/>
        <span className='recipe_name'>{solidResult.name}</span>
        {resultQty > 1 && (
          <Tooltip text={`This recipe makes ${resultQty}.`}>
            <span className='recipe_result-qty'>
              {resultQty}
            </span>
          </Tooltip>
        )}
        {hasEffects && (
          <ResultEffectsPopup resultReagents={recipe.resultReagents!}>
            <span className='reagent-effects_trigger'>fx</span>
          </ResultEffectsPopup>
        )}
      </span>
    );
  }
  if (reagentResult) {
    const { id: resultId, name: resultName } = reagentResult;
    return (
      <span className='recipe_result'>
        <ReagentSprite id={resultId}/>
        <span className='recipe_name'>
          {resultName}
        </span>
        <Tooltip
          text={
            `The recipe makes ${
              resultQty
            }u ${
              resultName
            } with the amounts shown. You can make larger or smaller batches as long as the ratio stays the same.`
          }
        >
          <span className='recipe_result-qty'>
            {`${resultQty}u`}
          </span>
        </Tooltip>
        {hasEffects && (
          <ResultEffectsPopup resultReagents={recipe.resultReagents!}>
            <span className='reagent-effects_trigger'>fx</span>
          </ResultEffectsPopup>
        )}
      </span>
    );
  }
  return <span>ERROR!</span>;
});

interface ResultEffectsPopupProps {
  resultReagents: readonly ResultReagent[];
  children: ReactElement<{ ref?: Ref<HTMLElement> }>;
}

const ResultEffectsPopup = ({
  resultReagents,
  children,
}: ResultEffectsPopupProps): ReactElement => {
  const { visible, popupRef, parentRef } = usePopupTrigger<HTMLDivElement>(
    'below'
  );

  const childWithRef = cloneElement(children, { ref: parentRef });

  return <>
    {childWithRef}
    {visible && createPortal(
      <div className='popup popup--effects' ref={popupRef}>
        <ResultReagentEffects resultReagents={resultReagents}/>
      </div>,
      getPopupRoot()
    )}
  </>;
};

interface ResultReagentEffectsProps {
  resultReagents: readonly ResultReagent[];
}

const ResultReagentEffects = memo(({
  resultReagents,
}: ResultReagentEffectsProps): ReactElement => {
  const { reagentMap } = useGameData();

  return (
    <div className='result-effects'>
      {resultReagents.map(rr => {
        const reagent = reagentMap.get(rr.id);
        return (
          <div key={rr.id} className='result-effects_reagent'>
            <span className='result-effects_reagent-header'>
              <span
                className='result-effects_reagent-name'
                style={{ color: reagent?.color }}
              >
                {reagent?.name ?? rr.id}
              </span>
              <span className='result-effects_reagent-qty'>
                {rr.quantity}u
              </span>
            </span>
            {rr.metabolisms && (
              <ReagentEffects metabolisms={rr.metabolisms}/>
            )}
          </div>
        );
      })}
    </div>
  );
});
