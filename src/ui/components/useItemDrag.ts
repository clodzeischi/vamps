// Dragging items between the inventory's boxes: lifted with the left button,
// following the pointer anywhere on the page; dropped on a box it moves there
// (if allowed), anywhere else it goes back. Esc or a right click cancels.
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { ItemId } from "../../data/equipment";
import {
  CONTAINERS,
  samePlace,
  sizeOf,
  type Container,
  type WornSlot,
} from "../../sim/people/inventory";
import { CELL } from "./ItemBox";
import type { Ref } from "./Inventory";

/** The item being dragged: where from, and where in its box (pixels) it was taken. */
export interface Held {
  from: Ref;
  item: ItemId;
  gx: number;
  gy: number;
}

const WORN: WornSlot[] = ["helmet", "armour", "weapon"];

/** Whether a drop leaves the item where it was: no move. */
export function isSameRef(from: Ref, to: Ref): boolean {
  if ("floor" in from || "floor" in to) return "floor" in from && "floor" in to;
  if ("armoury" in from || "armoury" in to) return "armoury" in from && "armoury" in to;
  return samePlace(from, to);
}

export function useItemDrag(
  root: RefObject<HTMLDivElement | null>,
  allowed: (from: Ref, to: Ref) => boolean,
  onMove: (from: Ref, to: Ref) => void,
) {
  const [held, setHeld] = useState<Held | null>(null);
  const [hover, setHover] = useState<Ref | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  /** Starts a drag (left button). The grip is where the item's box was pressed, or its middle if it isn't drawn at its size there. */
  const lift = (e: ReactPointerEvent, from: Ref, item: ItemId) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection
    const [w, h] = sizeOf(item);
    const box = (e.target as Element).closest(".inv-item")?.getBoundingClientRect();
    setMouse({ x: e.clientX, y: e.clientY });
    setHover(null);
    setHeld({
      from,
      item,
      gx: box ? e.clientX - box.left : (w * CELL) / 2,
      gy: box ? e.clientY - box.top : (h * CELL) / 2,
    });
  };

  /** Where the held item would go with the cursor there: a container's nearest cells, a slot, the ground, the armoury. */
  const targetAt = (x: number, y: number): Ref | null => {
    if (!held) return null;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
    if (!el || !root.current?.contains(el)) return null;
    const id = el.dataset.drop!;
    if (id === "floor") return { floor: "" };
    if (id === "armoury") return { armoury: held.item };
    if ((WORN as string[]).includes(id)) return { slot: id as WornSlot };
    const c = id as Container,
      r = el.getBoundingClientRect(),
      [w, h] = sizeOf(held.item);
    const cell = (at: number, room: number) => Math.max(0, Math.min(room, Math.round(at / CELL)));
    return {
      in: c,
      x: cell(x - held.gx - r.left, CONTAINERS[c].w - w),
      y: cell(y - held.gy - r.top, CONTAINERS[c].h - h),
    };
  };

  // The window listeners are set once a drag starts; they call the latest handlers.
  const handlers = useRef({ move: (_: PointerEvent) => {}, up: (_: PointerEvent) => {} });
  handlers.current = {
    move: (e) => {
      setMouse({ x: e.clientX, y: e.clientY });
      setHover(targetAt(e.clientX, e.clientY));
    },
    up: (e) => {
      const to = targetAt(e.clientX, e.clientY);
      if (held && to && !isSameRef(held.from, to) && allowed(held.from, to)) onMove(held.from, to);
      setHeld(null);
      setHover(null);
    },
  };
  const dragging = !!held;
  useEffect(() => {
    if (!dragging) return;
    const cancel = () => {
      setHeld(null);
      setHover(null);
    };
    const move = (e: PointerEvent) => handlers.current.move(e);
    const up = (e: PointerEvent) => handlers.current.up(e);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancel();
    };
    const menu = (e: Event) => {
      e.preventDefault();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("contextmenu", menu);
    window.addEventListener("keydown", key, true);
    document.body.classList.add("inv-dragging");
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("contextmenu", menu);
      window.removeEventListener("keydown", key, true);
      document.body.classList.remove("inv-dragging");
    };
  }, [dragging]);

  /** Where the held item is over, unless that's where it came from. */
  const target = held && hover && !isSameRef(held.from, hover) ? hover : null;
  return { held, target, mouse, lift };
}
