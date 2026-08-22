/** @type {import('tailwindcss').Config} */
//
// QuestForge redesign — cream / warm-dark palette.
//
// Every color reads from a CSS variable defined in src/index.css so both light
// and dark themes flip with a single class swap. The palette is intentionally
// quiet: one warm terracotta accent, no gradients, no glow, hairline borders
// (1px on light, 1.5px focus ring). Two typefaces — Instrument Sans for UI,
// JetBrains Mono for numbers/time/dates.
//
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border-c)",
        "border-strong": "var(--border-strong)",
        sidebar: "var(--sidebar-bg)",
        fg: "var(--fg)",
        "fg-2": "var(--fg-2)",
        "fg-3": "var(--fg-3)",
        accent: {
          DEFAULT: "var(--accent)",
          bg: "var(--accent-bg)",
          fg: "var(--accent-fg)",
        },
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          bg: "var(--danger-bg)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          bg: "var(--warn-bg)",
        },
      },
      fontFamily: {
        sans: [
          "'Instrument Sans'",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "ui-monospace",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "5px",
        md: "5px",
        lg: "8px",
        xl: "10px",
      },
      boxShadow: {
        // Very restrained shadows — used sparingly, only for elevation of
        // floating surfaces (modals, popovers, active tab pills). No colored
        // glow anywhere — depth is expressed with hairlines instead.
        DEFAULT: "0 1px 2px rgba(0, 0, 0, 0.04)",
        card: "0 1px 2px rgba(0, 0, 0, 0.04)",
        pop: "0 8px 24px -12px rgba(0, 0, 0, 0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "xp-pop": {
          "0%": { transform: "translateY(4px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "xp-pop": "xp-pop 200ms ease-out",
      },
    },
  },
  plugins: [],
};
