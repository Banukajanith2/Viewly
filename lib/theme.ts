/**
 * Theme handling, without a dependency.
 *
 * next-themes was tried first and removed: it renders its no-flash `<script>` from
 * inside a client component, and React 19 refuses to execute scripts encountered
 * during client rendering, so every page logged a console error. A script rendered
 * by a Server Component has no such problem, which is what NO_FLASH_SCRIPT below is.
 *
 * Client-safe: no server imports, so the toggle can import it directly.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "viewly-theme";

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/* ------------------------------------------------------------------ store */

/**
 * A tiny external store, so components can read the theme through
 * useSyncExternalStore instead of mirroring it into state inside an effect.
 * Calling setState in an effect body causes a cascading second render, and React
 * now flags it; this is the shape the hook exists for.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  // `storage` fires in OTHER tabs, so changing the theme in one window updates
  // every other open window too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export const getThemeSnapshot = (): Theme => readStoredTheme();

/** Matches what the server renders, so hydration has nothing to disagree about. */
export const getThemeServerSnapshot = (): Theme => "system";

export function setTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  emit();
}

/**
 * Runs before first paint, injected by the root layout (a Server Component).
 *
 * It has to be synchronous and inline: anything deferred means the page paints in
 * the default theme first and then flips, which is the flash this exists to prevent.
 * Wrapped in try/catch because localStorage throws outright in some privacy modes,
 * and a theme preference is never worth breaking the page over.
 */
export const NO_FLASH_SCRIPT = `
(function(){try{
  var t = localStorage.getItem('${THEME_STORAGE_KEY}') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}catch(e){}})();
`.trim();
