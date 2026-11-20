/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "Arial", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Newsreader Variable"', "Newsreader", "Georgia", "serif"],
        serif: ['"Newsreader Variable"', "Newsreader", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Mapped onto the CSS tokens so the palette has one home, and the
        // utility classes already littered through the app pick up the change.
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        "ink-4": "var(--ink-4)",
        cloud: "var(--canvas)",
        surface: "var(--surface)",
        sunk: "var(--surface-sunk)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        rail: "var(--rail)",
        "rail-edge": "var(--rail-edge)",
        "rail-text": "var(--rail-text)",
        brand: "var(--brand)",
        ember: "var(--ember)",
        "brand-tint": "var(--brand-tint)",
        mint: "var(--ok)",
        coral: "var(--bad)",
        amber: "var(--warn)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        soft: "var(--shadow-md)",
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
        premium: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};
