/** Dev builds and the browser tests' build put handles on window; the real build doesn't. */
export const HANDLES = import.meta.env.DEV || import.meta.env.MODE === "e2e";
