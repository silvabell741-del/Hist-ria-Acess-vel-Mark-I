/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        scifi: ['Orbitron', 'sans-serif'],
        epic: ['Cinzel', 'serif'],
        japanese: ['Sawarabi Mincho', 'serif'],
        modern: ['Space Grotesk', 'sans-serif'],
      },
    },
  },
  plugins: [],
}