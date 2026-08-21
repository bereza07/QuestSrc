/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark-fantasy HUD palette — muted, modern, subtle glow accents.
        bg: {
          DEFAULT: "#0d0f17",
          soft: "#141824",
          card: "#181d2b",
          elevated: "#1f2536",
        },
        border: {
          DEFAULT: "#272e42",
          soft: "#20263700",
        },
        ink: {
          DEFAULT: "#e6e9f2",
          soft: "#9aa3bd",
          faint: "#5f6883",
        },
        accent: {
          // Arcane amber — primary progression color.
          DEFAULT: "#d9a441",
          soft: "#b98a34",
          glow: "#f0c264",
        },
        arcane: {
          // Secondary magical accent.
          DEFAULT: "#6f8cff",
          soft: "#5570d6",
        },
        success: "#5bbf82",
        danger: "#d3596b",
        warn: "#e0a13c",
        streak: "#f0803c",
      },
      fontFamily: {
        display: ["'Cinzel'", "'Trajan Pro'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px -4px rgba(217, 164, 65, 0.35)",
        "glow-arcane": "0 0 20px -4px rgba(111, 140, 255, 0.35)",
        card: "0 8px 24px -12px rgba(0, 0, 0, 0.6)",
      },
      keyframes: {
        "level-up": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "40%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "xp-pop": {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "bar-fill": {
          from: { width: "0%" },
        },
      },
      animation: {
        "level-up": "level-up 0.5s ease-out",
        "xp-pop": "xp-pop 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
