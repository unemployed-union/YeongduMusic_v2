export type ActionMenuAnchor = { x: number; y: number };

type Viewport = { width: number; height: number };
type Insets = { top: number; right: number; bottom: number; left: number };

const MARGIN = 12;
const GAP = 12;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function getActionMenuPosition(anchor: ActionMenuAnchor, viewport: Viewport, insets: Insets, measuredHeight: number) {
  const leftEdge = insets.left + MARGIN;
  const rightEdge = viewport.width - insets.right - MARGIN;
  const topEdge = insets.top + MARGIN;
  const bottomEdge = viewport.height - insets.bottom - MARGIN;
  const width = Math.min(300, Math.max(0, rightEdge - leftEdge));
  const maxHeight = Math.max(0, bottomEdge - topEdge);
  const height = Math.min(measuredHeight, maxHeight);
  const below = anchor.y + GAP;
  const above = anchor.y - GAP - height;

  return {
    width,
    maxHeight,
    left: clamp(anchor.x - width / 2, leftEdge, rightEdge - width),
    top: clamp(below + height <= bottomEdge ? below : above, topEdge, bottomEdge - height),
  };
}
