/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Inter carries the interface: it was drawn for screens and its digits
        // line up, which matters on every payroll and attendance table here.
        sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        // Plus Jakarta Sans gives headings a little warmth against the orange.
        display: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', '"Inter Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
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
