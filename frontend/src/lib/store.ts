// Globaler Client-State (Zustand) — UI-Toggles, aktiver Hub etc.
// Server-State liegt in React-Query.

import { create } from "zustand";
import { isMockMode, setMockMode as persistMock } from "./env";

export type Theme = "dark" | "light";

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
    if (ls === "light" || ls === "dark") return ls;
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
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", t === "dark");
    }
  },
  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
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
