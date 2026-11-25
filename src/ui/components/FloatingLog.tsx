import { useEffect, useRef, useState } from "react";

export interface LogLine {
  /** What it's filed under when the log is open: a turn, a day. */
  head: string;
  text: string;
  tone: string;
}

/**
 * Messages as plain text over the buttons at the bottom (battles and the
 * globe), like the objectives: the last three; "All messages" opens them in
 * place, about five lines tall and scrolling.
 */
export function FloatingLog({ lines }: { lines: LogLine[] }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, lines.length]);
  if (!lines.length) return null;
  const shown = open ? lines : lines.slice(-3);
  const first = lines.length - shown.length;
  return (
    <div className={`float-log${open ? " open" : ""}`}>
      {lines.length > 3 && (
        <button className="float-log-toggle" onClick={() => setOpen(!open)}>
          {open ? "▾ Fewer" : `▴ All messages (${lines.length})`}
        </button>
      )}
      <div ref={listRef} className="float-log-lines">
        {shown.map((l, i) => (
          <div key={first + i}>
            {open && l.head !== shown[i - 1]?.head && <div className="float-log-head">{l.head}</div>}
            <span className={`tone-${l.tone}`}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
