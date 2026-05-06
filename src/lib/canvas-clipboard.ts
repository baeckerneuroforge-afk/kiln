/**
 * Pure helpers for the canvas copy/paste clipboard.
 *
 * Kept framework-free so they can be unit-tested without spinning up
 * ReactFlow / DOM. The visual-team-editor calls these to compute paste
 * offsets and to filter edges that belong to a copied node group.
 */

export interface ClipNode {
  id: string;
  position: { x: number; y: number };
}

export interface ClipEdge {
  source: string;
  target: string;
  sourceHandle?: string;
}

/**
 * Computes the bounding box top-left of a group of nodes. Returned
 * coordinates are used to make positions relative when copying, so that
 * pasting later can offset the whole group as a unit.
 *
 * Edge case: empty input returns {x: 0, y: 0} — callers should already
 * guard against pasting an empty clipboard.
 */
export function boundingTopLeft(nodes: ClipNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  return {
    x: Math.min(...nodes.map((n) => n.position.x)),
    y: Math.min(...nodes.map((n) => n.position.y)),
  };
}

/**
 * Picks edges whose source AND target are both in the copied node set.
 * Edges with one endpoint outside the selection are intentionally
 * dropped — pasting them would create dangling references.
 */
export function pickInternalEdges(edges: ClipEdge[], nodeIds: Set<string>): ClipEdge[] {
  return edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
}

/**
 * Whether the bulk-delete action requires explicit confirmation. The
 * threshold (5+) is calibrated to nudge users when a misclick would
 * destroy meaningful work without making single-node deletes annoying.
 */
export function shouldConfirmBulkDelete(count: number): boolean {
  return count >= 5;
}

/**
 * Default offset for paste operations — keeps the pasted group visually
 * distinct from the original without scattering it off-screen.
 */
export const PASTE_OFFSET_PX = 40;
