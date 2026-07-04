/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        cloud: "#f7fafc",
        line: "#dbe4ef",
        brand: "#1677c8",
        mint: "#18a058",
        coral: "#e46f55",
        amber: "#c98918"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(23,32,51,0.08)"
      }
    }
  },
  plugins: []
};
