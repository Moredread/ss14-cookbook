import {
  Dispatch,
  ReactElement,
  SetStateAction,
  memo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useBlocker } from 'react-router';
import { FocusTrap } from '../focus';
import { CloseIcon } from '../icons';
import { Tooltip } from '../tooltip';
import { ExploreFnContext, ExploreRecipeFn } from './context';
import { RecipeGraph } from './graph';

export interface Props {
  id: string;
  setRecipe: Dispatch<SetStateAction<string | null>>;
}

export const RecipeExplorer = memo(({
  id,
  setRecipe,
}: Props): ReactElement => {
  const exploreFn = useCallback<ExploreRecipeFn>((id: string) => {
    setRecipe(prevId => id === prevId ? null : id);
  }, [setRecipe]);

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current!.focus();
  }, [id]);

  // Always prevent navigation while this is open
  useBlocker(true);

  return (
    <ExploreFnContext.Provider value={exploreFn}>
      <FocusTrap>
        <section
          className='explorer'
          aria-label='Recipe explorer'
          tabIndex={-1}
          ref={mainRef}
        >
          <RecipeGraph rootId={id}/>

          <Tooltip text='Close recipe explorer' placement='left' provideLabel>
            <button
              className='explorer_close'
              onClick={() => setRecipe(null)}
            >
              <CloseIcon/>
            </button>
          </Tooltip>
        </section>
      </FocusTrap>
    </ExploreFnContext.Provider>
  );
});
