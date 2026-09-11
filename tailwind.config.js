/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', "Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ['"Geist Variable"', "Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono Variable"', '"Geist Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: "#1c1917",
        cloud: "#faf7f2",
        line: "#ece5db",
        brand: "#ea580c",
        mint: "#18a058",
        coral: "#e46f55",
        amber: "#c98918"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(124,45,18,0.10)"
      }
    }
  },
  plugins: []
};
