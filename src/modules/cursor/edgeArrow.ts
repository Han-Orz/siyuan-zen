import { EDGE_ARROW } from "../../config";
import type { EdgeProximity } from "../../utils/edgeProximity";

type ArrowDirection = "up" | "down";

let arrowEl: HTMLDivElement | null = null;
let arrowVisible = false;

/**
 * Optional viewport-edge arrow for the smooth cursor.
 *
 * Kept isolated because the feature is disabled by default, but still owns DOM
 * state and CSS variables when enabled.
 */
function createArrowElement(): HTMLDivElement {
  let el = document.getElementById("zentype-edge-arrow") as HTMLDivElement | null;
  if (el) return el;

  el = document.createElement("div");
  el.id = "zentype-edge-arrow";
  el.style.cssText = [
    "position: fixed",
    "pointer-events: none",
    `--zt-arrow-opacity: ${EDGE_ARROW.OPACITY}`,
    `--zt-arrow-size: ${EDGE_ARROW.SIZE}px`,
    `--zt-arrow-offset: ${EDGE_ARROW.OFFSET}px`,
    `--zt-arrow-transition: ${EDGE_ARROW.TRANSITION_MS}ms`,
  ].join("; ");
  el.setAttribute("data-direction", "none");
  document.body.appendChild(el);
  return el;
}

function getOffScreenArrowPosition(
  cursorX: number,
  cursorY: number,
  direction: ArrowDirection,
): { x: number; y: number } {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const halfSize = EDGE_ARROW.SIZE / 2;

  const x = Math.max(halfSize, Math.min(vpW - halfSize, cursorX));
  const y = direction === "up" ? EDGE_ARROW.OFFSET : vpH - EDGE_ARROW.OFFSET;

  // cursorY is reserved for future horizontal/diagonal arrow placement.
  void cursorY;
  return { x, y };
}

function showArrow(edge: EdgeProximity, direction: ArrowDirection): void {
  if (!arrowEl) arrowEl = createArrowElement();

  const { x, y } = getOffScreenArrowPosition(edge.cursorX, edge.cursorY, direction);
  arrowEl.style.left = `${x}px`;
  arrowEl.style.top = `${y}px`;
  arrowEl.setAttribute("data-direction", direction);
  arrowEl.classList.add("visible");
  arrowVisible = true;
}

function hideArrow(): void {
  if (!arrowEl || !arrowVisible) return;
  arrowEl.classList.remove("visible");
  arrowVisible = false;
}

export function updateEdgeArrow(
  edge: EdgeProximity,
  isOuterElement: boolean | undefined,
  allowed: boolean,
): void {
  if (!EDGE_ARROW.ENABLED) return;

  if (isOuterElement === true) {
    hideArrow();
  } else if (isOuterElement === false && edge.edge === "top" && edge.isOffScreen) {
    showArrow(edge, "up");
  } else if (isOuterElement === false && edge.edge === "bottom" && edge.isOffScreen) {
    showArrow(edge, "down");
  } else if (allowed === true) {
    hideArrow();
  }
}

export function destroyEdgeArrow(): void {
  if (arrowEl) {
    arrowEl.remove();
    arrowEl = null;
  }
  arrowVisible = false;
}
