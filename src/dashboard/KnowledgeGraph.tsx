import type {
  DashboardKnowledgeGraphEdge,
  DashboardKnowledgeGraphNode
} from "./contracts";
import { useState } from "react";

export interface KnowledgeGraphProps {
  nodes: DashboardKnowledgeGraphNode[];
  edges: DashboardKnowledgeGraphEdge[];
}

interface GraphPoint {
  x: number;
  y: number;
}

type VaultLensKind = DashboardKnowledgeGraphNode["kind"] | "all";

interface VaultLensOption {
  kind: VaultLensKind;
  label: string;
  count: number;
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => nodes[0]?.id ?? null);
  const [activeLens, setActiveLens] = useState<VaultLensKind>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = normalizeVaultSearchQuery(searchQuery);
  const lensOptions = createVaultLensOptions(nodes);
  const lensFilteredNodes = activeLens === "all"
    ? nodes
    : nodes.filter((node) => node.kind === activeLens);
  const lensFilteredNodeIds = new Set(lensFilteredNodes.map((node) => node.id));
  const lensRelationEdges = edges.filter((edge) => (
    lensFilteredNodeIds.has(edge.from) || lensFilteredNodeIds.has(edge.to)
  ));
  const lensBacklinks = createReadableBacklinks(lensRelationEdges, nodes);
  const lensVaultNotes = createVaultNotes(lensFilteredNodes, lensBacklinks);
  const matchingVaultNotes = normalizedSearchQuery.length > 0
    ? lensVaultNotes.filter((note) => matchesVaultSearch(note, normalizedSearchQuery))
    : lensVaultNotes;
  const matchingNodeIds = new Set(matchingVaultNotes.map((note) => note.id));
  const filteredNodes = lensFilteredNodes.filter((node) => matchingNodeIds.has(node.id));
  const filteredNodeIds = new Set(filteredNodes.map((node) => node.id));
  const positions = createGraphPositions(filteredNodes);
  const visibleEdges = edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to));
  const relationEdges = edges.filter((edge) => filteredNodeIds.has(edge.from) || filteredNodeIds.has(edge.to));
  const backlinks = createReadableBacklinks(relationEdges, nodes);
  const learningLoopSteps = createLearningLoopSteps(
    activeLens === "all" && normalizedSearchQuery.length === 0 ? visibleEdges : relationEdges,
    nodes
  );
  const promptStackSteps = createPromptStackSteps(nodes, edges);
  const promptSourceLedgerEntries = createPromptSourceLedgerEntries(nodes, edges);
  const vaultNotes = createVaultNotes(filteredNodes, backlinks);
  const selectedNote = vaultNotes.find((note) => note.id === selectedNodeId) ?? vaultNotes[0] ?? null;
  const selectedId = selectedNote?.id ?? null;
  const focusedNeighborhood = createFocusedNeighborhood(selectedId, nodes, edges);
  const promptProvenanceTrails = createPromptProvenanceTrails(selectedId, nodes, edges);
  const summary = normalizedSearchQuery.length > 0
    ? `Showing ${filteredNodes.length} of ${nodes.length} notes for ${normalizedSearchQuery}`
    : `Showing ${filteredNodes.length} of ${nodes.length} notes`;
  const setLens = (kind: VaultLensKind) => {
    setActiveLens(kind);
    setSelectedNodeId(kind === "all"
      ? nodes[0]?.id ?? null
      : nodes.find((node) => node.kind === kind)?.id ?? null);
  };

  return (
    <section
      aria-label="Knowledge graph"
      className="skfiy-knowledge-graph"
      role="region"
    >
      <div className="skfiy-vault-lens">
        <div className="skfiy-vault-lens-controls" role="toolbar" aria-label="Vault lens">
          {lensOptions.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={activeLens === option.kind}
              onClick={() => setLens(option.kind)}
            >
              {`${option.label} ${option.count}`}
            </button>
          ))}
        </div>
        <label className="skfiy-vault-search">
          <span>Vault search</span>
          <input
            aria-label="Vault search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
        </label>
        <p role="status" aria-label="Vault lens summary">
          {summary}
        </p>
      </div>
      <div className="skfiy-knowledge-panel skfiy-knowledge-panel--prompt-stack">
        <h3>Prompt stack</h3>
        <ol aria-label="Prompt stack">
          {promptStackSteps.map((step, index) => (
            <li key={step.stage}>
              <strong>{index + 1}</strong>
              <span>{step.stage}</span>
              <small>{step.items.join(", ")}</small>
            </li>
          ))}
        </ol>
      </div>
      <div className="skfiy-knowledge-panel skfiy-knowledge-panel--source-ledger">
        <h3>Prompt source ledger</h3>
        <ul aria-label="Prompt source ledger">
          {promptSourceLedgerEntries.map((entry) => (
            <li key={entry.stage} data-status={entry.statusTone}>
              <strong>{entry.stage}</strong>
              <span>{entry.status}</span>
              <small>{entry.items.join(", ")}</small>
            </li>
          ))}
        </ul>
      </div>
      <div className="skfiy-knowledge-graph-canvas">
        <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} aria-label="Knowledge graph canvas">
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
              <g
                key={`${edge.from}-${edge.to}-${edge.label}`}
                className={`skfiy-graph-edge${isSelectedEdge(edge, selectedId) ? " is-selected" : ""}`}
              >
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                {edge.label === "blocked by" ? null : (
                  <text x={label.x} y={label.y}>{edge.label}</text>
                )}
              </g>
            );
          })}
          {filteredNodes.map((node) => {
            const point = positions.get(node.id) as GraphPoint;
            const radius = NODE_RADIUS[node.kind];

            return (
              <g
                key={node.id}
                className="skfiy-graph-node"
                data-kind={node.kind}
                data-selected={selectedId === node.id ? "true" : undefined}
                data-tone={node.tone}
                role="button"
                tabIndex={0}
                transform={`translate(${point.x} ${point.y})`}
                aria-label={`Focus note ${node.label}`}
                onClick={() => setSelectedNodeId(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedNodeId(node.id);
                  }
                }}
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
        <div className="skfiy-knowledge-panel skfiy-knowledge-panel--nodes">
          <h3>Nodes</h3>
          <ul aria-label="Knowledge graph nodes">
            {filteredNodes.map((node) => (
              <li key={node.id}>
                <strong>{node.label}</strong>
                <span>{node.kind}</span>
                {node.detail ? <small>{node.detail}</small> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="skfiy-knowledge-panel skfiy-knowledge-panel--loop">
          <h3>Learning loop</h3>
          <ul aria-label="Learning loop">
            {learningLoopSteps.length > 0 ? learningLoopSteps.map((step) => (
              <li key={step}>
                <span>{step}</span>
              </li>
            )) : (
              <li>
                <span>No durable learning loop yet.</span>
              </li>
            )}
          </ul>
        </div>
        <div className="skfiy-knowledge-panel skfiy-knowledge-panel--focus" aria-label="Focused note" role="region">
          <h3>Focused note</h3>
          {selectedNote ? (
            <article>
              <div className="skfiy-vault-focus-heading">
                <h4>{selectedNote.fileName}</h4>
                <span>{selectedNote.kind}</span>
              </div>
              <p>{selectedNote.detail}</p>
              <strong>{`Backlinks ${selectedNote.relations.length}`}</strong>
              {selectedNote.relations.length > 0 ? (
                <ul aria-label="Focused note backlinks">
                  {selectedNote.relations.map((relation, index) => (
                    <li key={`${selectedNote.id}-${relation}-${index}`}>
                      <span>{relation}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No backlinks yet.</p>
              )}
              {promptProvenanceTrails.length > 0 ? (
                <>
                  <strong>Prompt provenance</strong>
                  <ul aria-label="Prompt provenance" className="skfiy-prompt-provenance">
                    {promptProvenanceTrails.map((trail) => (
                      <li key={`${selectedNote.id}-${trail}`}>
                        <span>{trail}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {focusedNeighborhood.length > 0 ? (
                <>
                  <strong>Focused neighborhood</strong>
                  <ul aria-label="Focused neighborhood" className="skfiy-focused-neighborhood">
                    {focusedNeighborhood.map((neighbor, index) => (
                      <li key={`${selectedNote.id}-${neighbor.id}-${neighbor.direction}-${neighbor.relation}-${index}`}>
                        <strong>{neighbor.label}</strong>
                        <span>{neighbor.relation}</span>
                        <small>{neighbor.direction}</small>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ) : (
            <p>No vault notes yet.</p>
          )}
        </div>
        <div className="skfiy-knowledge-panel skfiy-knowledge-panel--notes">
          <h3>Vault notes</h3>
          <ul aria-label="Vault notes" className="skfiy-vault-notes">
            {vaultNotes.map((note) => (
              <li key={note.id} data-kind={note.kind} data-selected={selectedId === note.id ? "true" : undefined}>
                <button
                  type="button"
                  className="skfiy-vault-note-button"
                  aria-label={`Open note ${note.fileName}`}
                  aria-pressed={selectedId === note.id}
                  onClick={() => setSelectedNodeId(note.id)}
                >
                  <strong>{note.fileName}</strong>
                  <span>{note.kind}</span>
                  <small>{note.detail}</small>
                  <small>{`Backlinks ${note.relations.length}`}</small>
                </button>
                {note.relations.length > 0 ? (
                  <span className="skfiy-vault-note-links" aria-label={`${note.fileName} links`}>
                    {note.relations.slice(0, 3).map((relation, index) => (
                      <em key={`${note.id}-${relation}-${index}`}>{relation}</em>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="skfiy-knowledge-panel skfiy-knowledge-panel--backlinks">
          <h3>Vault backlinks</h3>
          <ul aria-label="Vault backlinks">
            {backlinks.map((backlink) => (
              <li key={`${backlink.from}-${backlink.to}-${backlink.label}`}>
                <strong>{backlink.fromLabel}</strong>
                <span>{backlink.label}</span>
                <small>{backlink.toLabel}</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="skfiy-knowledge-panel skfiy-knowledge-panel--links">
          <h3>Links</h3>
          <ul aria-label="Knowledge graph links">
            {backlinks.map((backlink) => (
              <li key={`${backlink.from}-${backlink.to}-${backlink.label}`}>
                <strong>{backlink.label}</strong>
                <span>{`${backlink.fromLabel} -> ${backlink.toLabel}`}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function isSelectedEdge(edge: DashboardKnowledgeGraphEdge, selectedId: string | null): boolean {
  return selectedId !== null && (edge.from === selectedId || edge.to === selectedId);
}

const LEARNING_LOOP_EDGE_ORDER = new Map([
  ["teaches", 0],
  ["distills", 1],
  ["guides behavior", 2],
  ["injects prompt", 3],
  ["recalls context", 4],
  ["observed in", 5],
  ["answered", 6]
]);

interface PromptStackStep {
  stage: string;
  items: string[];
}

interface PromptSourceLedgerEntry {
  stage: string;
  status: string;
  statusTone: "ready" | "pending" | "blocked";
  items: string[];
}

function createPromptStackSteps(
  nodes: DashboardKnowledgeGraphNode[],
  edges: DashboardKnowledgeGraphEdge[]
): PromptStackStep[] {
  const provider = nodes.find((node) => node.kind === "provider");
  const providerId = provider?.id;
  const promptProviderEdges = providerId
    ? edges.filter((edge) => edge.to === providerId)
    : edges;
  const steps: PromptStackStep[] = [];
  const memoryLabels = readPromptSourceLabels({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["injects prompt", "guides behavior"]),
    matchesNode: (node) => node.kind === "memory"
      && node.id !== "profile:working"
      && !node.id.startsWith("memory:pending:")
  });
  const sessionLabels = readPromptSourceLabels({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["recalls context"]),
    matchesNode: (node) => node.kind === "session"
  });
  const skillLabels = readPromptSourceLabels({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["guides prompt"]),
    matchesNode: (node) => node.kind === "skill"
  });
  const workingProfileLabels = readPromptSourceLabels({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["travels with prompt"]),
    matchesNode: (node) => node.id === "profile:working"
  });
  const browserLabels = nodes
    .filter((node) => node.kind === "browser")
    .map((node) => node.label);

  pushPromptStackStep(steps, "Memory", memoryLabels);
  pushPromptStackStep(steps, "Recalled sessions", sessionLabels);
  pushPromptStackStep(steps, "Personal skills", skillLabels);
  pushPromptStackStep(steps, "Working profile", workingProfileLabels);
  pushPromptStackStep(steps, "Browser Context", browserLabels);
  pushPromptStackStep(steps, "Background Agent", provider ? [provider.label] : []);

  return steps;
}

function readPromptSourceLabels({
  edges,
  labels,
  matchesNode,
  nodes
}: {
  nodes: DashboardKnowledgeGraphNode[];
  edges: DashboardKnowledgeGraphEdge[];
  labels: Set<string>;
  matchesNode: (node: DashboardKnowledgeGraphNode) => boolean;
}): string[] {
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const matchingNodeIds = new Set(edges
    .filter((edge) => labels.has(edge.label))
    .map((edge) => edge.from));

  return nodes
    .filter((node) => matchingNodeIds.has(node.id) && matchesNode(node))
    .slice()
    .sort((left, right) => (nodeIndex.get(left.id) ?? 0) - (nodeIndex.get(right.id) ?? 0))
    .map((node) => node.label);
}

function pushPromptStackStep(
  steps: PromptStackStep[],
  stage: string,
  items: string[]
): void {
  if (items.length > 0) {
    steps.push({ stage, items });
  }
}

function createPromptSourceLedgerEntries(
  nodes: DashboardKnowledgeGraphNode[],
  edges: DashboardKnowledgeGraphEdge[]
): PromptSourceLedgerEntry[] {
  const provider = nodes.find((node) => node.kind === "provider");
  const providerId = provider?.id;
  const promptProviderEdges = providerId
    ? edges.filter((edge) => edge.to === providerId)
    : edges;
  const entries: PromptSourceLedgerEntry[] = [];
  const durableMemoryNodes = readPromptSourceNodes({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["injects prompt", "guides behavior"]),
    matchesNode: (node) => node.kind === "memory"
      && node.id !== "profile:working"
      && !node.id.startsWith("memory:pending:")
  });
  const pendingMemoryLabels = nodes
    .filter((node) => node.kind === "memory" && node.id.startsWith("memory:pending:"))
    .map((node) => node.label);
  const sessionLabels = readPromptSourceLabels({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["recalls context"]),
    matchesNode: (node) => node.kind === "session"
  });
  const skillLabels = readPromptSourceLabels({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["guides prompt"]),
    matchesNode: (node) => node.kind === "skill"
  });
  const workingProfileLabels = readPromptSourceLabels({
    nodes,
    edges: promptProviderEdges,
    labels: new Set(["travels with prompt"]),
    matchesNode: (node) => node.id === "profile:working"
  });
  const browserNodes = nodes.filter((node) => node.kind === "browser");
  const browserLabels = browserNodes.map((node) => node.label);

  pushPromptSourceLedgerEntry(entries, {
    stage: "Memory",
    status: readMemoryLedgerStatus(durableMemoryNodes),
    statusTone: readMemoryLedgerTone(durableMemoryNodes),
    items: durableMemoryNodes.map(formatMemoryLedgerItem)
  });
  pushPromptSourceLedgerEntry(entries, {
    stage: "Pending memory",
    status: "review gated",
    statusTone: "pending",
    items: pendingMemoryLabels
  });
  pushPromptSourceLedgerEntry(entries, {
    stage: "Recalled sessions",
    status: "prompt-safe recall",
    statusTone: "ready",
    items: sessionLabels
  });
  pushPromptSourceLedgerEntry(entries, {
    stage: "Personal skills",
    status: "prompt-safe distilled",
    statusTone: "ready",
    items: skillLabels
  });
  pushPromptSourceLedgerEntry(entries, {
    stage: "Working profile",
    status: "prompt-safe portable",
    statusTone: "ready",
    items: workingProfileLabels
  });
  pushPromptSourceLedgerEntry(entries, {
    stage: "Browser Context",
    status: browserNodes.length > 0 ? readWorstStatus(browserNodes) : "unavailable",
    statusTone: browserNodes.length > 0 ? readWorstStatusTone(browserNodes) : "blocked",
    items: browserLabels.length > 0 ? browserLabels : ["No current page context"]
  });
  pushPromptSourceLedgerEntry(entries, {
    stage: "Background Agent",
    status: provider ? readNodeReadinessStatus(provider) : "missing",
    statusTone: provider ? readNodeReadinessTone(provider) : "blocked",
    items: provider ? [provider.label] : []
  });

  return entries;
}

function pushPromptSourceLedgerEntry(
  entries: PromptSourceLedgerEntry[],
  entry: PromptSourceLedgerEntry
): void {
  if (entry.items.length > 0) {
    entries.push(entry);
  }
}

function readPromptSourceNodes({
  edges,
  labels,
  matchesNode,
  nodes
}: {
  nodes: DashboardKnowledgeGraphNode[];
  edges: DashboardKnowledgeGraphEdge[];
  labels: Set<string>;
  matchesNode: (node: DashboardKnowledgeGraphNode) => boolean;
}): DashboardKnowledgeGraphNode[] {
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const matchingNodeIds = new Set(edges
    .filter((edge) => labels.has(edge.label))
    .map((edge) => edge.from));

  return nodes
    .filter((node) => matchingNodeIds.has(node.id) && matchesNode(node))
    .slice()
    .sort((left, right) => (nodeIndex.get(left.id) ?? 0) - (nodeIndex.get(right.id) ?? 0));
}

function readMemoryLedgerStatus(nodes: DashboardKnowledgeGraphNode[]): string {
  if (nodes.some((node) => node.tone === "danger")) {
    return "memory pressure full";
  }
  if (nodes.some((node) => node.tone === "warning")) {
    return "memory pressure warning";
  }
  return "prompt-safe durable";
}

function readMemoryLedgerTone(nodes: DashboardKnowledgeGraphNode[]): PromptSourceLedgerEntry["statusTone"] {
  if (nodes.some((node) => node.tone === "danger")) {
    return "blocked";
  }
  if (nodes.some((node) => node.tone === "warning")) {
    return "pending";
  }
  return "ready";
}

function formatMemoryLedgerItem(node: DashboardKnowledgeGraphNode): string {
  const usageLabel = readMemoryUsageLabel(node.detail);
  return usageLabel ? `${node.label} ${usageLabel}` : node.label;
}

function readMemoryUsageLabel(detail: string | undefined): string | undefined {
  return detail?.match(/\b\d+% - [\d,]+\/[\d,]+ chars\b/u)?.[0];
}

function readWorstStatus(nodes: DashboardKnowledgeGraphNode[]): string {
  if (nodes.some((node) => node.tone === "danger")) {
    return "blocked";
  }
  if (nodes.some((node) => node.tone === "warning")) {
    return "blocked or gated";
  }
  if (nodes.some((node) => node.tone === "success")) {
    return "ready";
  }
  return "observed";
}

function readWorstStatusTone(nodes: DashboardKnowledgeGraphNode[]): PromptSourceLedgerEntry["statusTone"] {
  if (nodes.some((node) => node.tone === "danger" || node.tone === "warning")) {
    return "blocked";
  }
  return "ready";
}

function readNodeReadinessStatus(node: DashboardKnowledgeGraphNode): string {
  if (node.tone === "success") {
    return "ready";
  }
  if (node.tone === "warning") {
    return "needs attention";
  }
  if (node.tone === "danger") {
    return "blocked";
  }
  return "available";
}

function readNodeReadinessTone(node: DashboardKnowledgeGraphNode): PromptSourceLedgerEntry["statusTone"] {
  if (node.tone === "danger") {
    return "blocked";
  }
  if (node.tone === "warning") {
    return "pending";
  }
  return "ready";
}

function createLearningLoopSteps(
  edges: DashboardKnowledgeGraphEdge[],
  nodes: DashboardKnowledgeGraphNode[]
): string[] {
  return edges
    .filter((edge) => LEARNING_LOOP_EDGE_ORDER.has(edge.label))
    .slice()
    .sort((left, right) => {
      const leftRank = LEARNING_LOOP_EDGE_ORDER.get(left.label) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = LEARNING_LOOP_EDGE_ORDER.get(right.label) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return `${left.from}-${left.to}`.localeCompare(`${right.from}-${right.to}`);
    })
    .map((edge) => `${readNodeLabel(edge.from, nodes)} -> ${edge.label} -> ${readNodeLabel(edge.to, nodes)}`);
}

function createVaultLensOptions(nodes: DashboardKnowledgeGraphNode[]): VaultLensOption[] {
  const countByKind = new Map<DashboardKnowledgeGraphNode["kind"], number>();
  nodes.forEach((node) => {
    countByKind.set(node.kind, (countByKind.get(node.kind) ?? 0) + 1);
  });

  return [
    { kind: "all", label: "All", count: nodes.length },
    ...Array.from(countByKind.entries()).map(([kind, count]) => ({
      kind,
      label: formatLensLabel(kind),
      count
    }))
  ];
}

function formatLensLabel(kind: DashboardKnowledgeGraphNode["kind"]): string {
  if (kind === "computer-use") {
    return "Computer Use";
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

interface VaultNote {
  id: string;
  fileName: string;
  kind: DashboardKnowledgeGraphNode["kind"];
  detail: string;
  relations: string[];
}

function createReadableBacklinks(
  edges: DashboardKnowledgeGraphEdge[],
  nodes: DashboardKnowledgeGraphNode[]
): Array<DashboardKnowledgeGraphEdge & { fromLabel: string; toLabel: string }> {
  return edges.map((edge) => ({
    ...edge,
    fromLabel: readNodeLabel(edge.from, nodes),
    toLabel: readNodeLabel(edge.to, nodes)
  }));
}

function createVaultNotes(
  nodes: DashboardKnowledgeGraphNode[],
  edges: Array<DashboardKnowledgeGraphEdge & { fromLabel: string; toLabel: string }>
): VaultNote[] {
  return nodes.map((node) => {
    const relations = edges
      .filter((edge) => edge.from === node.id || edge.to === node.id)
      .map((edge) => edge.from === node.id
        ? `${edge.label} -> ${edge.toLabel}`
        : `${edge.fromLabel} -> ${edge.label}`);

    return {
      id: node.id,
      fileName: `${node.label}.md`,
      kind: node.kind,
      detail: node.detail ?? "Local runtime note",
      relations
    };
  });
}

function matchesVaultSearch(note: VaultNote, query: string): boolean {
  return normalizeVaultSearchQuery([
    note.fileName,
    note.kind,
    note.detail,
    ...note.relations
  ].join(" ")).includes(query);
}

function normalizeVaultSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

interface FocusedNeighbor {
  id: string;
  label: string;
  relation: string;
  direction: "incoming" | "outgoing";
}

interface GraphTrail {
  nodes: string[];
  labels: string[];
}

function createPromptProvenanceTrails(
  selectedId: string | null,
  nodes: DashboardKnowledgeGraphNode[],
  edges: DashboardKnowledgeGraphEdge[]
): string[] {
  if (!selectedId) {
    return [];
  }

  const providerIds = new Set(nodes
    .filter((node) => node.kind === "provider")
    .map((node) => node.id));
  const upstreamTrails = createBackwardTrails(selectedId, nodes, edges, 3);
  const downstreamTrails = createForwardProviderTrails(selectedId, providerIds, edges, 4);
  const incoming = upstreamTrails.length > 0 ? upstreamTrails : [{ nodes: [selectedId], labels: [] }];
  const outgoing = downstreamTrails.length > 0 ? downstreamTrails : [{ nodes: [selectedId], labels: [] }];
  const labelsById = new Map(nodes.map((node) => [node.id, node.label]));
  const trails: string[] = [];

  for (const sourceTrail of incoming) {
    for (const providerTrail of outgoing) {
      if (
        sourceTrail.nodes[sourceTrail.nodes.length - 1] !== selectedId
        || providerTrail.nodes[0] !== selectedId
      ) {
        continue;
      }

      const combinedTrail = {
        nodes: [...sourceTrail.nodes, ...providerTrail.nodes.slice(1)],
        labels: [...sourceTrail.labels, ...providerTrail.labels]
      };
      if (combinedTrail.labels.length === 0) {
        continue;
      }

      trails.push(formatGraphTrail(combinedTrail, labelsById));
    }
  }

  return Array.from(new Set(trails)).slice(0, 6);
}

function createBackwardTrails(
  targetId: string,
  nodes: DashboardKnowledgeGraphNode[],
  edges: DashboardKnowledgeGraphEdge[],
  maxDepth: number
): GraphTrail[] {
  const trails: GraphTrail[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const walk = (
    currentId: string,
    pathNodes: string[],
    pathLabels: string[],
    visited: Set<string>,
    depth: number
  ) => {
    const incomingEdges = edges.filter((edge) => edge.to === currentId && !visited.has(edge.from));
    if (
      incomingEdges.length === 0
      || depth >= maxDepth
      || (pathLabels.length > 0 && isPromptProvenanceRoot(currentId, nodeById))
    ) {
      if (pathLabels.length > 0) {
        trails.push({
          nodes: pathNodes.slice().reverse(),
          labels: pathLabels.slice().reverse()
        });
      }
      return;
    }

    incomingEdges.forEach((edge) => {
      walk(
        edge.from,
        [...pathNodes, edge.from],
        [...pathLabels, edge.label],
        new Set([...visited, edge.from]),
        depth + 1
      );
    });
  };

  walk(targetId, [targetId], [], new Set([targetId]), 0);

  return trails;
}

function isPromptProvenanceRoot(
  nodeId: string,
  nodeById: Map<string, DashboardKnowledgeGraphNode>
): boolean {
  if (nodeId.startsWith("memory:pending:")) {
    return true;
  }

  const kind = nodeById.get(nodeId)?.kind;
  return kind === "session"
    || kind === "browser"
    || kind === "turn"
    || kind === "alert"
    || kind === "provider";
}

function createForwardProviderTrails(
  startId: string,
  providerIds: Set<string>,
  edges: DashboardKnowledgeGraphEdge[],
  maxDepth: number
): GraphTrail[] {
  const trails: GraphTrail[] = [];

  const walk = (
    currentId: string,
    pathNodes: string[],
    pathLabels: string[],
    visited: Set<string>,
    depth: number
  ) => {
    if (pathLabels.length > 0 && providerIds.has(currentId)) {
      trails.push({ nodes: pathNodes, labels: pathLabels });
      return;
    }
    if (depth >= maxDepth) {
      return;
    }

    edges
      .filter((edge) => edge.from === currentId && !visited.has(edge.to))
      .forEach((edge) => {
        walk(
          edge.to,
          [...pathNodes, edge.to],
          [...pathLabels, edge.label],
          new Set([...visited, edge.to]),
          depth + 1
        );
      });
  };

  walk(startId, [startId], [], new Set([startId]), 0);

  return trails;
}

function formatGraphTrail(
  trail: GraphTrail,
  labelsById: Map<string, string>
): string {
  const parts: string[] = [];
  trail.labels.forEach((label, index) => {
    parts.push(labelsById.get(trail.nodes[index]) ?? trail.nodes[index]);
    parts.push(label);
  });
  parts.push(labelsById.get(trail.nodes[trail.nodes.length - 1]) ?? trail.nodes[trail.nodes.length - 1]);

  return parts.join(" -> ");
}

function createFocusedNeighborhood(
  selectedId: string | null,
  nodes: DashboardKnowledgeGraphNode[],
  edges: DashboardKnowledgeGraphEdge[]
): FocusedNeighbor[] {
  if (!selectedId) {
    return [];
  }

  return edges
    .filter((edge) => edge.from === selectedId || edge.to === selectedId)
    .map((edge) => {
      const direction = edge.to === selectedId ? "incoming" : "outgoing";
      const neighborId = direction === "incoming" ? edge.from : edge.to;
      return {
        id: neighborId,
        label: readNodeLabel(neighborId, nodes),
        relation: edge.label,
        direction
      };
    });
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
