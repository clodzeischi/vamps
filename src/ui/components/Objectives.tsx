import type { ReactNode } from "react";

export interface ObjectiveLine {
  text: string;
  state?: "done" | "failed";
  tip?: string;
  optional?: boolean;
}

/** What there is to do, as plain text at the top right (battles and the globe): a title, the conditions, and each objective, ticked off or failed. */
export function ObjectivesText({ title, conditions, lines }: { title: string; conditions: ReactNode; lines: ObjectiveLine[] }) {
  return (
    <div className="objectives">
      <div className="obj-title">{title}</div>
      <div className="obj-conditions">{conditions}</div>
      <ul className="obj-list">
        {lines.map((l) => (
          <li key={l.text} className={`${l.state ?? ""}${l.optional ? " optional" : ""}`} data-tip={l.tip}>
            <span className="obj-mark">{l.state === "done" ? "✓" : l.state === "failed" ? "✗" : "◆"}</span>
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
