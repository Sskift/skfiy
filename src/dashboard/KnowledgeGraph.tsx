import type {
  DashboardKnowledgeGraphEdge,
  DashboardKnowledgeGraphNode
} from "./contracts";

export interface KnowledgeGraphProps {
  nodes: DashboardKnowledgeGraphNode[];
  edges: DashboardKnowledgeGraphEdge[];
}

interface GraphPoint {
  x: number;
  y: number;
}

const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 430;
const KIND_ANCHORS: Record<DashboardKnowledgeGraphNode["kind"], GraphPoint> = {
  memory: { x: 150, y: 132 },
  session: { x: 378, y: 92 },
  provider: { x: 608, y: 142 },
  browser: { x: 238, y: 318 },
  "computer-use": { x: 530, y: 320 },
  skill: { x: 92, y: 286 },
  turn: { x: 658, y: 286 },
  alert: { x: 388, y: 360 }
};

const NODE_RADIUS: Record<DashboardKnowledgeGraphNode["kind"], number> = {
  memory: 34,
  session: 30,
  provider: 36,
  browser: 32,
  "computer-use": 36,
  skill: 28,
  turn: 30,
  alert: 26
};

const ALERT_POSITIONS: GraphPoint[] = [
  { x: 198, y: 354 },
  { x: 304, y: 290 },
  { x: 420, y: 370 },
  { x: 548, y: 276 },
  { x: 660, y: 354 }
];

export function KnowledgeGraph({ nodes, edges }: KnowledgeGraphProps) {
  const positions = createGraphPositions(nodes);
  const visibleEdges = edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to));

  return (
    <section
      aria-label="Knowledge graph"
      className="skfiy-knowledge-graph"
      role="region"
    >
      <div className="skfiy-knowledge-graph-canvas" aria-hidden="true">
        <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img">
          <defs>
            <linearGradient id="skfiy-graph-link" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.72" />
            </linearGradient>
          </defs>
          {visibleEdges.map((edge) => {
            const from = positions.get(edge.from) as GraphPoint;
            const to = positions.get(edge.to) as GraphPoint;
            const label = midpoint(from, to);

            return (
              <g key={`${edge.from}-${edge.to}-${edge.label}`} className="skfiy-graph-edge">
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                {edge.label === "blocked by" ? null : (
                  <text x={label.x} y={label.y}>{edge.label}</text>
                )}
              </g>
            );
          })}
          {nodes.map((node) => {
            const point = positions.get(node.id) as GraphPoint;
            const radius = NODE_RADIUS[node.kind];

            return (
              <g
                key={node.id}
                className="skfiy-graph-node"
                data-kind={node.kind}
                data-tone={node.tone}
                transform={`translate(${point.x} ${point.y})`}
              >
                <circle r={radius} />
                <text className="skfiy-graph-node-label" y="-3">{formatCanvasLabel(node.label)}</text>
                <text className="skfiy-graph-node-kind" y="14">{node.kind}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="skfiy-knowledge-graph-fallback">
        <div>
          <h3>Nodes</h3>
          <ul aria-label="Knowledge graph nodes">
            {nodes.map((node) => (
              <li key={node.id}>
                <strong>{node.label}</strong>
                <span>{node.kind}</span>
                {node.detail ? <small>{node.detail}</small> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Links</h3>
          <ul aria-label="Knowledge graph links">
            {visibleEdges.map((edge) => (
              <li key={`${edge.from}-${edge.to}-${edge.label}`}>
                <strong>{edge.label}</strong>
                <span>{`${readNodeLabel(edge.from, nodes)} -> ${readNodeLabel(edge.to, nodes)}`}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function createGraphPositions(nodes: DashboardKnowledgeGraphNode[]): Map<string, GraphPoint> {
  const kindCounts = new Map<DashboardKnowledgeGraphNode["kind"], number>();
  const positions = new Map<string, GraphPoint>();

  nodes.forEach((node) => {
    const index = kindCounts.get(node.kind) ?? 0;
    const anchor = KIND_ANCHORS[node.kind];
    kindCounts.set(node.kind, index + 1);
    if (node.kind === "alert") {
      positions.set(node.id, ALERT_POSITIONS[index] ?? {
        x: 170 + (index % 4) * 145,
        y: 272 + Math.floor(index / 4) * 70
      });
      return;
    }
    positions.set(node.id, {
      x: anchor.x + (index % 2 === 0 ? 1 : -1) * Math.ceil(index / 2) * 86,
      y: anchor.y + (index % 3) * 34
    });
  });

  return positions;
}

function midpoint(from: GraphPoint, to: GraphPoint): GraphPoint {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - 8
  };
}

function readNodeLabel(id: string, nodes: DashboardKnowledgeGraphNode[]): string {
  return nodes.find((node) => node.id === id)?.label ?? id;
}

function formatCanvasLabel(label: string): string {
  return label.length > 20 ? `${label.slice(0, 18)}...` : label;
}
