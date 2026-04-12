/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#6C63FF', dark: '#4b44cc', light: '#ede9ff' },
        surface: { DEFAULT: '#16161d', 2: '#1f1f2a', 3: '#272733' },
      },
      fontFamily: { sans: ['var(--font-sora)', 'sans-serif'], mono: ['var(--font-mono)', 'monospace'] },
      animation: { float: 'float 3s ease-in-out infinite', pulse2: 'pulse2 2s infinite' },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        pulse2: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
      },
    },
  },
  plugins: [],
};
