// A person's portrait, framed. Without a picture: a dark frame with their initials.
import type { Person } from "../../data/people";

const url = (file: string) => `${import.meta.env.BASE_URL}assets/portraits/${file}`;

export function Portrait({
  person,
  size = "md",
  hidden = false,
}: {
  person: Person;
  size?: "xs" | "sm" | "md";
  hidden?: boolean;
}) {
  if (person.portrait && !hidden)
    return (
      <img
        className={`portrait portrait-${size}`}
        src={url(person.portrait)}
        alt={person.name}
        draggable={false}
      />
    );
  const initials = hidden
    ? "?"
    : person.name
        .split(/\s+/)
        .filter((w) => /^[A-ZÀ-Þ]/.test(w))
        .slice(0, 2)
        .map((w) => w[0])
        .join("");
  return (
    <div
      className={`portrait portrait-${size} portrait-blank`}
      aria-label={hidden ? "Unknown" : person.name}
    >
      <span>{initials}</span>
    </div>
  );
}
