import { signed, supportTone, supportWord } from "../format";

/** -5..+5 as eleven pips, with the current (rounded) level highlighted. */
export function SupportBar({ support }: { support: number }) {
  const level = Math.round(support);
  return (
    <div className="support">
      <div className="support-pips">
        {Array.from({ length: 11 }, (_, i) => i - 5).map((v) => (
          <span
            key={v}
            className={`pip ${v === 0 ? "pip-zero" : ""} ${v === level ? `pip-on tone-${supportTone(support)}` : ""} ${
              (v > 0 && v <= level) || (v < 0 && v >= level) ? "pip-fill" : ""
            }`}
          />
        ))}
      </div>
      <span className={`support-word tone-${supportTone(support)}-text`}>
        {signed(level)} {supportWord(support)}
      </span>
    </div>
  );
}
