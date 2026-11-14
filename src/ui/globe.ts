// The single GlobeView instance, shared by the screens that drive it.
import type { GlobeView } from "../render/GlobeView";

let current: GlobeView | null = null;
export const setGlobe = (g: GlobeView | null) => (current = g);
export const globe = () => current;
