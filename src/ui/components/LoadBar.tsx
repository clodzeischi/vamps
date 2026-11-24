// Aircraft load as a segmented bar: one segment per thing aboard, its width
// its load, coloured by kind (docs/WEB_PORT.md 3.7c).
export interface LoadItem { id: string; label: string; load: number; kind: "operative" | "scientist" | "engineer" | "analyst" | "bio" | "goods" | "kit" }

export function LoadBar({ items, capacity }: { items: LoadItem[]; capacity: number }) {
  const used = items.reduce((t, i) => t + i.load, 0);
  const over = used > capacity;
  const scale = Math.max(capacity, used);
  return (
    <div className={`loadbar${over ? " over" : ""}`} title={`${used} of ${capacity}`}>
      <div className="loadbar-track">
        {items.map((i) => <span key={i.id} className={`seg ${i.kind}`} style={{ width: `${(100 * i.load) / scale}%` }} title={`${i.label} (${i.load})`} />)}
        {Array.from({ length: Math.ceil(scale) - 1 }, (_, k) => <span key={`t${k}`} className="tick" style={{ left: `${(100 * (k + 1)) / scale}%` }} />)}
      </div>
      <span className="loadbar-num">{used} / {capacity}</span>
    </div>
  );
}
