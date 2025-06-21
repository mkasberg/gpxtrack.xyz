import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        'barlow': ['Barlow', 'sans-serif'],
      },
      scrollbar: {
        'thin': {
          width: '6px',
        }
      }
    },
  },
  plugins: [],
} satisfies Config