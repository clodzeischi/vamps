// The emblem of the Ordo Potestatis Vera: a goat's skull on a sword, over a
// cross pattée. It replaces any cross in the interface. Two layers, both
// alpha masks built by scripts/build-emblem.py: the cross's body as dark
// iron, and the engraving (skull, horns, sword, rim) in brass over it.
const mask = (file: string) => {
  const m = `url(${import.meta.env.BASE_URL}assets/emblem/${file}) center / contain no-repeat`;
  return { mask: m, WebkitMask: m };
};

export function Emblem({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`emblem ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="emblem-plate" style={mask("plate.png")} />
      <span className="emblem-bone" style={mask("bone.png")} />
    </div>
  );
}
