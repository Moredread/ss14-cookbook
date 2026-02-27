import { memo, ReactElement, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { DropdownIcon } from '../icons';
import { Recipe } from '../recipe';

export interface RecipeNodeData {
  recipeId: string;
  isRoot: boolean;
  isCycle: boolean;
  hasUpstream: boolean;
  hasDownstream: boolean;
  expandedUpstream: boolean;
  expandedDownstream: boolean;
  onToggle: (nodeId: string, direction: 'upstream' | 'downstream') => void;
  [key: string]: unknown;
}

interface RecipeNodeProps {
  id: string;
  data: RecipeNodeData;
}

export const RecipeNode = memo(({ id, data }: RecipeNodeProps): ReactElement => {
  const {
    recipeId,
    isRoot,
    isCycle,
    hasUpstream,
    hasDownstream,
    expandedUpstream,
    expandedDownstream,
    onToggle,
  } = data;

  const toggleUpstream = useCallback(() => {
    onToggle(id, 'upstream');
  }, [id, onToggle]);

  const toggleDownstream = useCallback(() => {
    onToggle(id, 'downstream');
  }, [id, onToggle]);

  return (
    <div
      className={
        isRoot
          ? 'explorer_graph-node explorer_graph-node--root nodrag nopan nowheel'
          : isCycle
            ? 'explorer_graph-node explorer_graph-node--cycle nodrag nopan nowheel'
            : 'explorer_graph-node nodrag nopan nowheel'
      }
    >
      <Handle
        type='target'
        position={Position.Left}
        style={{ visibility: 'hidden' }}
      />

      {hasUpstream && !isCycle && !isRoot &&
        <button
          className={
            expandedUpstream
              ? 'explorer_graph-toggle explorer_graph-toggle--left'
              : 'explorer_graph-toggle explorer_graph-toggle--left explorer_graph-toggle--collapsed'
          }
          onClick={toggleUpstream}
          aria-label={expandedUpstream ? 'Collapse upstream' : 'Expand upstream'}
        >
          <DropdownIcon size={14}/>
        </button>
      }

      <Recipe id={recipeId} skipDefaultHeaderAction/>

      {hasDownstream && !isCycle && !isRoot &&
        <button
          className={
            expandedDownstream
              ? 'explorer_graph-toggle explorer_graph-toggle--right'
              : 'explorer_graph-toggle explorer_graph-toggle--right explorer_graph-toggle--collapsed'
          }
          onClick={toggleDownstream}
          aria-label={expandedDownstream ? 'Collapse downstream' : 'Expand downstream'}
        >
          <DropdownIcon size={14}/>
        </button>
      }

      <Handle
        type='source'
        position={Position.Right}
        style={{ visibility: 'hidden' }}
      />
    </div>
  );
});
