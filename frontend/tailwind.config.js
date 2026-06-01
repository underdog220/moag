/** @type {import('tailwindcss').Config} */
// Theme-Farben kommen aus CSS-Variablen (src/styles/index.css), damit mehrere
// Themes (dark / light / amber) ueber eine Klasse am <html> umschaltbar sind.
// RGB-Tripel-Pattern `rgb(var(--c-x) / <alpha-value>)` erhaelt Tailwind-Alpha
// (z.B. bg-status-error/10).
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: c("--c-bg"),
          elevated: c("--c-bg-elevated"),
          subtle: c("--c-bg-subtle"),
          panel: c("--c-bg-panel"),
        },
        fg: {
          DEFAULT: c("--c-fg"),
          muted: c("--c-fg-muted"),
          subtle: c("--c-fg-subtle"),
        },
        brand: {
          DEFAULT: c("--c-brand"),
          hover: c("--c-brand-hover"),
        },
        status: {
          ok: c("--c-ok"),
          warn: c("--c-warn"),
          error: c("--c-error"),
          info: c("--c-info"),
          neutral: c("--c-neutral"),
        },
        accent: {
          DEFAULT: c("--c-brand"),
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
      fontSize: {
        xxs: ["0.6875rem", "1rem"],
      },
    },
  },
  plugins: [],
};
