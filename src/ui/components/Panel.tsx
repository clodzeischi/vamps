import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}

export function Meter({
  value,
  max = 100,
  tone,
}: {
  value: number;
  max?: number;
  tone: "good" | "warn" | "bad";
}) {
  return (
    <div className="meter">
      <div
        className={`meter-fill tone-${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
      />
    </div>
  );
}
