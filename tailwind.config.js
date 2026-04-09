/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: '#0a0a0c',
          secondary: '#141418',
          card: '#1c1c21',
        },
        accent: {
          primary: '#00f2ff',
          secondary: '#7000ff',
        },
        border: '#2d2d35',
        success: '#00ff88',
        error: '#ff4d4d',
        warning: '#ffcc00',
        text: {
          primary: '#f0f0f0',
          secondary: '#9ea4b0',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'neon': '0 0 10px rgba(0, 242, 255, 0.4)',
        'neon-purple': '0 0 10px rgba(112, 0, 255, 0.4)',
      }
    },
  },
  plugins: [],
}
