// Globaler Client-State (Zustand) — UI-Toggles, aktiver Hub etc.
// Server-State liegt in React-Query.

import { create } from "zustand";
import { isMockMode, setMockMode as persistMock } from "./env";

export type Theme = "dark" | "light" | "amber";

const THEMES: Theme[] = ["dark", "light", "amber"];

/** Setzt die Theme-Klasse am <html>. Single-Source fuer DOM-Sync. */
export function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("theme-dark", "theme-light", "theme-amber");
  el.classList.add(`theme-${t}`);
  // .dark fuer Tailwind darkMode:"class" — dark UND amber sind dunkle Themes.
  el.classList.toggle("dark", t !== "light");
}

interface UiState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;

  mockMode: boolean;
  setMockMode: (m: boolean) => void;

  // Aktive Hub-ID (kann von Settings ueberschrieben werden)
  activeHubId: string | null;
  setActiveHubId: (id: string | null) => void;
}

const initialTheme: Theme = (() => {
  if (typeof window === "undefined") return "dark";
  try {
    const ls = window.localStorage?.getItem("moag.theme");
    if (ls === "light" || ls === "dark" || ls === "amber") return ls;
  } catch {
    // ignore
  }
  return "dark";
})();

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme,
  setTheme: (t) => {
    set({ theme: t });
    try {
      window.localStorage?.setItem("moag.theme", t);
    } catch {
      // ignore
    }
    applyTheme(t);
  },
  toggleTheme: () => {
    // Zyklus: dark -> light -> amber -> dark
    const cur = get().theme;
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    get().setTheme(next);
  },

  mockMode: isMockMode(),
  setMockMode: (m) => {
    persistMock(m);
    set({ mockMode: m });
  },

  activeHubId: null,
  setActiveHubId: (id) => set({ activeHubId: id }),
}));
