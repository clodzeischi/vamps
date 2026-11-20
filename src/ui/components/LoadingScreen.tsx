// The loading screen before a battle. Building a battle (the map, the
// meshes, the shaders) blocks the page for a few seconds, so the screen is
// painted first, and only then is the battle mounted behind it; the battle
// says when it's drawn (useLoaded), and the screen fades away.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Emblem } from "./Emblem";

const LoadedContext = createContext<() => void>(() => {});

/** For the screen behind: call it once the first frame is on screen. */
export const useLoaded = () => useContext(LoadedContext);

const HINTS = [
  "Right-click moves; left-click selects and shoots.",
  "The wheel steps through the levels of a building.",
  "Tab picks the next agent; a number key picks one, pressed again it looks at them.",
  "Next to low cover, agents crouch behind it.",
  "Q and E turn the camera; WASD pans.",
  "Blue outline: there's still time to shoot after the move.",
];

export function LoadingScreen({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [gone, setGone] = useState(false);
  const [hint] = useState(() => HINTS[Math.floor(Math.random() * HINTS.length)]!);
  // Two frames, so the loading screen is painted before the blocking work starts.
  useEffect(() => {
    let b = 0;
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => setMounted(true))));
    return () => (cancelAnimationFrame(a), cancelAnimationFrame(b));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(t);
  }, [loaded]);
  return (
    <LoadedContext.Provider value={() => setLoaded(true)}>
      {mounted && children}
      {!gone && (
        <div className={`loading-screen${loaded ? " done" : ""}`}>
          <div className="loading-inner">
            <Emblem size={112} className="loading-emblem" />
            <h1 className="loading-title">{title}</h1>
            {sub && <div className="loading-sub">{sub}</div>}
            <div className="loading-bar"><span /></div>
            <div className="loading-hint">{hint}</div>
          </div>
        </div>
      )}
    </LoadedContext.Provider>
  );
}
