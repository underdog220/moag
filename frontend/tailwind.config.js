/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Eigene Theme-Palette: dunkel-blau-grau, Status-Akzente
        bg: {
          DEFAULT: "#0f172a", // dark default
          elevated: "#1e293b",
          subtle: "#1a2436",
          panel: "#172033",
        },
        fg: {
          DEFAULT: "#e2e8f0",
          muted: "#94a3b8",
          subtle: "#64748b",
        },
        brand: {
          DEFAULT: "#3b82f6",
          hover: "#2563eb",
        },
        status: {
          ok: "#22c55e",      // grün
          warn: "#eab308",    // gelb
          error: "#ef4444",   // rot
          info: "#3b82f6",
          neutral: "#64748b",
        },
        accent: {
          DEFAULT: "#3b82f6",
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
