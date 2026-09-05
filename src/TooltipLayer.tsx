import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** One tooltip for pointer and keyboard users, outside clipping containers. */
export function TooltipLayer() {
  const id = useId();
  const tooltip = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dismiss = () => {
      clearTimeout(timer);
      setAnchor(null);
    };
    const findAnchor = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-tooltip]")
        : null;
    const show = (event: PointerEvent | FocusEvent) => {
      if (event instanceof PointerEvent && event.pointerType === "touch") return;
      if (event.target instanceof Node && tooltip.current?.contains(event.target)) {
        clearTimeout(timer);
        return;
      }
      const next = findAnchor(event.target);
      clearTimeout(timer);
      if (!next?.dataset.tooltip) {
        setAnchor(null);
        return;
      }
      if (event.type === "focusin") setAnchor(next);
      else timer = setTimeout(() => setAnchor(next), 250);
    };
    const leave = (event: PointerEvent | FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node &&
        (findAnchor(event.target)?.contains(next) || tooltip.current?.contains(next))) return;
      clearTimeout(timer);
      timer = setTimeout(() => setAnchor(null), 100);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (tooltip.current) event.preventDefault();
        dismiss();
      }
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", leave);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("click", dismiss, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.visualViewport?.addEventListener("resize", dismiss);
    window.visualViewport?.addEventListener("scroll", dismiss);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", show);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("click", dismiss, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.visualViewport?.removeEventListener("resize", dismiss);
      window.visualViewport?.removeEventListener("scroll", dismiss);
    };
  }, []);

  useLayoutEffect(() => {
    const element = tooltip.current;
    if (!anchor || !element) return;
    // The top layer also keeps labels visible above modal dialogs.
    element.showPopover?.();
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 8;
    const top = (viewport?.offsetTop ?? 0) + 8;
    const right = left + (viewport?.width ?? window.innerWidth) - 16;
    const bottom = top + (viewport?.height ?? window.innerHeight) - 16;
    element.style.maxWidth = `${Math.min(260, right - left)}px`;
    element.style.maxHeight = `${bottom - top}px`;
    const target = anchor.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const above = target.top - box.height - 8;
    const y = above >= top ? above : target.bottom + 8;
    element.style.left = `${Math.max(left, Math.min(target.left + (target.width - box.width) / 2, right - box.width))}px`;
    element.style.top = `${Math.max(top, Math.min(y, bottom - box.height))}px`;
    const describedBy = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", [describedBy, id].filter(Boolean).join(" "));
    return () => {
      if (describedBy) anchor.setAttribute("aria-describedby", describedBy);
      else anchor.removeAttribute("aria-describedby");
    };
  }, [anchor, id]);

  return anchor && createPortal(
    <div ref={tooltip} id={id} role="tooltip" popover="manual" className="app-tooltip">
      {anchor.dataset.tooltip}
    </div>,
    document.body,
  );
}
