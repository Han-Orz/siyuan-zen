export interface PopoverDragContext {
  getCursorElement: () => HTMLDivElement | null;
  queueUpdate: () => void;
}

interface PopoverDragBinding {
  blockPopover: HTMLElement;
  dragEl: HTMLElement;
  onMouseDown: EventListener;
  onMouseMove: EventListener;
  onMouseUp: EventListener;
}
let popoverDragBinding: PopoverDragBinding | null = null;

/** 绑定 block__popover 拖动手柄（.resize__move）的 mousedown/mousemove/mouseup */
export function unbindPopoverDrag(): void {
  if (!popoverDragBinding) return;
  const { dragEl, onMouseDown, onMouseMove, onMouseUp } = popoverDragBinding;
  dragEl.removeEventListener("mousedown", onMouseDown);
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  popoverDragBinding = null;
}

export function bindPopoverDrag(
  cursorElement: Element | null,
  context: PopoverDragContext,
): void {
  if (!cursorElement) return;
  // 如果已有绑定但对应的 popover 已从 DOM 中移除（弹窗关闭），先清理再重新绑定
  if (popoverDragBinding && !popoverDragBinding.blockPopover.isConnected) {
    unbindPopoverDrag();
  }
  if (popoverDragBinding) return; // 已绑定，跳过（弹窗通常单实例）

  const blockPopover = cursorElement.closest(
    ".block__popover",
  ) as HTMLElement | null;
  if (!blockPopover) return;

  const dragEl = blockPopover.querySelector(
    ".resize__move",
  ) as HTMLElement | null;
  if (!dragEl) return;

  let isDragging = false;
  const onMouseDown: EventListener = () => {
    isDragging = true;
  };
  const onMouseMove: EventListener = () => {
    const el = context.getCursorElement();
    if (isDragging && el) {
      el.classList.add("no-transition");
      context.queueUpdate();
    }
  };
  const onMouseUp: EventListener = () => {
    isDragging = false;
  };

  // mousedown 绑在拖动手柄上（只有点击拖手才进入拖动状态）
  // mousemove/mouseup 绑在 document 上（保证鼠标移出手柄时仍能跟踪）
  dragEl.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove, { passive: true });
  document.addEventListener("mouseup", onMouseUp);

  popoverDragBinding = {
    blockPopover,
    dragEl,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}
