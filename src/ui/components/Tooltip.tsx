// One tooltip for the whole game. Anything with `data-tip` (or a plain
// `title`, which is taken over so the browser's own doesn't show too) gets a
// styled tooltip on hover. Text may have several lines; a line starting with
// "!" is a warning (why the button can't be used).
import { useEffect, useState } from "react";

interface Tip {
  lines: string[];
  x: number;
  y: number;
  below: boolean;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      if (el.hasAttribute("title")) {
        el.dataset.tip = el.getAttribute("title") ?? "";
        el.removeAttribute("title");
      }
      const text = el.dataset.tip;
      if (!text) return setTip(null);
      const r = el.getBoundingClientRect();
      const below = r.top < 140;
      setTip({
        lines: text.split("\n").filter(Boolean),
        x: r.left + r.width / 2,
        y: below ? r.bottom + 8 : r.top - 8,
        below,
      });
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(
        "[data-tip],[title]",
      ) as HTMLElement | null;
      if (el === current) return;
      current = el;
      if (el) show(el);
      else setTip(null);
    };
    const hide = () => {
      current = null;
      setTip(null);
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);
  if (!tip) return null;
  // Keep it on screen: clamp the centre, and flip below when near the top.
  const left = Math.max(170, Math.min(window.innerWidth - 170, tip.x));
  return (
    <div
      className={`tooltip${tip.below ? " below" : ""}`}
      style={{ left, top: tip.y }}
      role="tooltip"
    >
      {tip.lines.map((l, i) => (
        <div
          key={i}
          className={
            l.startsWith("!")
              ? "tooltip-warn"
              : i === 0 && tip.lines.length > 1
                ? "tooltip-head"
                : ""
          }
        >
          {l.replace(/^!\s*/, "")}
        </div>
      ))}
    </div>
  );
}

/** Joins tooltip lines; a blocker becomes a warning line. */
export const tipLines = (...lines: (string | null | undefined | false)[]) =>
  lines.filter(Boolean).join("\n");
export const warn = (blocker: string | null | undefined) => (blocker ? `! ${blocker}` : null);
