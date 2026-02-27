import {
  ReactElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  MarkerType,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useGameData } from '../context';
import { compareByName } from '../sort';
import { RecipeNode, RecipeNodeData } from './recipe-node';
import { getDownstreamRecipes, getUpstreamRecipes } from './relations';

// Stable nodeTypes reference (must be outside component per React Flow rules)
const nodeTypes = { recipe: RecipeNode };

const DefaultNodeWidth = 350;
const DefaultNodeHeight = 120;

interface ExpansionKey {
  nodeId: string;
  direction: 'upstream' | 'downstream';
}

const expansionKey = (nodeId: string, direction: string): string =>
  `${nodeId}:${direction}`;

export interface RecipeGraphProps {
  rootId: string;
}

export const RecipeGraph = memo(({ rootId }: RecipeGraphProps): ReactElement => {
  return (
    <ReactFlowProvider>
      <RecipeGraphInner rootId={rootId}/>
    </ReactFlowProvider>
  );
});

const RecipeGraphInner = memo(({ rootId }: RecipeGraphProps): ReactElement => {
  const gameData = useGameData();
  const {
    recipeMap,
    recipesBySolidResult,
    recipesBySolidIngredient,
    recipesByReagentResult,
    recipesByReagentIngredient,
    entityMap,
    reagentMap,
  } = gameData;

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // Reset expansion when root changes
  useEffect(() => {
    setExpanded(new Set());
  }, [rootId]);

  const onToggle = useCallback((nodeId: string, direction: 'upstream' | 'downstream') => {
    setExpanded(prev => {
      const key = expansionKey(nodeId, direction);
      const next = new Set(prev);
      if (next.has(key)) {
        // Collapse: remove this key and all keys that start with it
        // (collapse children too)
        for (const k of next) {
          if (k === key || k.startsWith(key + '/')) {
            next.delete(k);
          }
        }
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const compare = useMemo(() => {
    const cmp = compareByName(entityMap, reagentMap);
    return (a: string, b: string): number => {
      const recipeA = recipeMap.get(a)!;
      const recipeB = recipeMap.get(b)!;
      return cmp(recipeA, recipeB);
    };
  }, [recipeMap, entityMap, reagentMap]);

  // Build graph from expansion state
  const { nodes, edges } = useMemo(() => {
    const nodes: Node<RecipeNodeData>[] = [];
    const edges: Edge[] = [];

    const getRelated = (recipeId: string, direction: 'upstream' | 'downstream'): string[] => {
      const recipe = recipeMap.get(recipeId);
      if (!recipe) return [];
      if (direction === 'upstream') {
        return getUpstreamRecipes(recipe, recipesBySolidResult, recipesByReagentResult)
          .sort(compare);
      }
      return getDownstreamRecipes(recipe, recipesBySolidIngredient, recipesByReagentIngredient)
        .sort(compare);
    };

    // Build nodes recursively
    const visited = new Map<string, string>(); // nodeId -> recipeId (for tracking)
    const ancestors = new Set<string>(); // recipeIds in current path

    const addNode = (
      nodeId: string,
      recipeId: string,
      isRoot: boolean,
      parentNodeId: string | null,
      direction: 'upstream' | 'downstream' | null,
    ): void => {
      const isCycle = ancestors.has(recipeId);
      const upstream = isCycle ? [] : getRelated(recipeId, 'upstream');
      const downstream = isCycle ? [] : getRelated(recipeId, 'downstream');

      const upKey = expansionKey(nodeId, 'upstream');
      const downKey = expansionKey(nodeId, 'downstream');
      const expandedUp = expanded.has(upKey);
      const expandedDown = expanded.has(downKey);

      nodes.push({
        id: nodeId,
        type: 'recipe',
        position: { x: 0, y: 0 }, // dagre will set this
        data: {
          recipeId,
          isRoot,
          isCycle,
          hasUpstream: upstream.length > 0,
          hasDownstream: downstream.length > 0,
          expandedUpstream: expandedUp,
          expandedDownstream: expandedDown,
          onToggle,
        },
      });
      visited.set(nodeId, recipeId);

      // Add edge from parent
      if (parentNodeId && direction) {
        const edgeId = `${parentNodeId}->${nodeId}`;
        if (direction === 'upstream') {
          // Upstream child -> parent (left to right flow)
          edges.push({
            id: edgeId,
            source: nodeId,
            target: parentNodeId,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        } else {
          // Parent -> downstream child
          edges.push({
            id: edgeId,
            source: parentNodeId,
            target: nodeId,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        }
      }

      if (isCycle) return;
      ancestors.add(recipeId);

      // For root: expand both directions automatically (always shown)
      if (isRoot) {
        for (const childRecipeId of upstream) {
          const childNodeId = `${nodeId}/up:${childRecipeId}`;
          addNode(childNodeId, childRecipeId, false, nodeId, 'upstream');
        }
        for (const childRecipeId of downstream) {
          const childNodeId = `${nodeId}/dn:${childRecipeId}`;
          addNode(childNodeId, childRecipeId, false, nodeId, 'downstream');
        }
      } else {
        // Non-root: expand in the continuation direction based on toggle state
        if (expandedUp) {
          for (const childRecipeId of upstream) {
            const childNodeId = `${upKey}/${childRecipeId}`;
            addNode(childNodeId, childRecipeId, false, nodeId, 'upstream');
          }
        }
        if (expandedDown) {
          for (const childRecipeId of downstream) {
            const childNodeId = `${downKey}/${childRecipeId}`;
            addNode(childNodeId, childRecipeId, false, nodeId, 'downstream');
          }
        }
      }

      ancestors.delete(recipeId);
    };

    addNode('root', rootId, true, null, null);

    return { nodes, edges };
  }, [
    rootId, expanded, compare, onToggle, recipeMap,
    recipesBySolidResult, recipesBySolidIngredient,
    recipesByReagentResult, recipesByReagentIngredient,
  ]);

  // Edge labels: add "Made with" / "Used in" on edges from root only
  const labeledEdges = useMemo(() => {
    const rootUpstream = new Set<string>();
    const rootDownstream = new Set<string>();
    for (const edge of edges) {
      if (edge.target === 'root') {
        rootUpstream.add(edge.id);
      } else if (edge.source === 'root') {
        rootDownstream.add(edge.id);
      }
    }

    // Label only the middle edge of each group
    const upEdges = edges.filter(e => rootUpstream.has(e.id));
    const downEdges = edges.filter(e => rootDownstream.has(e.id));
    const upMiddle = upEdges.length > 0 ? upEdges[Math.floor(upEdges.length / 2)].id : null;
    const downMiddle = downEdges.length > 0 ? downEdges[Math.floor(downEdges.length / 2)].id : null;

    return edges.map(e => {
      if (e.id === upMiddle) {
        return { ...e, label: 'Made with' };
      }
      if (e.id === downMiddle) {
        return { ...e, label: 'Used in' };
      }
      return e;
    });
  }, [edges]);

  // Layout with dagre
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [layoutedNodes, setLayoutedNodes] = useState(nodes);
  const prevNodesRef = useRef(nodes);
  const needsLayoutRef = useRef(true);

  // When node structure changes, mark that we need layout
  if (nodes !== prevNodesRef.current) {
    prevNodesRef.current = nodes;
    needsLayoutRef.current = true;
  }

  useEffect(() => {
    if (!needsLayoutRef.current) return;
    if (nodes.length === 0) {
      setLayoutedNodes([]);
      return;
    }

    // Use measured dimensions if available, otherwise defaults
    const getNodeDimensions = (node: Node<RecipeNodeData>) => ({
      width: node.measured?.width ?? DefaultNodeWidth,
      height: node.measured?.height ?? DefaultNodeHeight,
    });

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR',
      nodesep: 30,
      ranksep: 80,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      const dims = getNodeDimensions(node);
      g.setNode(node.id, { width: dims.width, height: dims.height });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const result = nodes.map(node => {
      const pos = g.node(node.id);
      const dims = getNodeDimensions(node);
      return {
        ...node,
        position: {
          x: pos.x - dims.width / 2,
          y: pos.y - dims.height / 2,
        },
      };
    });

    setLayoutedNodes(result);
    needsLayoutRef.current = false;
    requestAnimationFrame(() => fitView({ duration: 200, padding: 0.15 }));
  }, [nodes, edges, nodesInitialized, fitView]);

  // Re-layout when nodes get measured (accurate dimensions)
  useEffect(() => {
    if (nodesInitialized) {
      needsLayoutRef.current = true;
      // Trigger re-render to pick up the flag
      setLayoutedNodes(prev => [...prev]);
    }
  }, [nodesInitialized]);

  const defaultEdgeOptions = useMemo(() => ({
    style: { stroke: 'var(--explorer-line)', strokeWidth: 2 },
    labelStyle: {
      fill: 'var(--fg)',
      fontSize: 13,
      fontWeight: 500,
      fontFamily: 'inherit',
    },
    labelBgStyle: {
      fill: 'var(--bg-level-0)',
    },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 4,
  }), []);

  const defaultMarkerColor = 'var(--explorer-line)';

  return (
    <div className='explorer_graph'>
      <ReactFlow
        nodes={layoutedNodes}
        edges={labeledEdges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        defaultMarkerColor={defaultMarkerColor}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
      />
    </div>
  );
});
