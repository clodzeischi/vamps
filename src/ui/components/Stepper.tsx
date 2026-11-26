// A number with − and + beside it, for how many of something.
import type { ReactNode } from "react";

export function Stepper({
  value,
  max,
  onChange,
  noMore = false,
  children,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  /** + is off for another reason (it can't be carried). */
  noMore?: boolean;
  /** More buttons after +. */
  children?: ReactNode;
}) {
  return (
    <span className="stepper">
      <button className="mini" disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span>{value}</span>
      <button
        className="mini"
        disabled={noMore || value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
      {children}
    </span>
  );
}
