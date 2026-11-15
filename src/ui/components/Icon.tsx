// An icon from game-icons.net (CC BY 3.0), drawn in the current text colour.
// The set we use is listed in scripts/build-icons.mjs.
import { ICONS, type IconName } from "../icons.generated";

export type { IconName };

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

export const hasIcon = (name: string): name is IconName => name in ICONS;
