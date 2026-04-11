import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      colors: {
        white: '#F0EFEB',
        brand: {
          50:  '#e8f5ee',
          100: '#c5e8d2',
          200: '#8fd0a9',
          300: '#57b57e',
          400: '#2a9558',
          500: '#007a3d',
          600: '#005323',
          700: '#003d1a',
          800: '#002912',
          900: '#001a0b',
        },
        accent: {
          400: '#57b57e',
          500: '#2a9558',
          600: '#007a3d',
          700: '#005323',
        },
        surface: '#F0EFEB',
        sidebar: '#001a0b',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #005323 0%, #007a3d 100%)',
        'gradient-hero':  'linear-gradient(135deg, #e8f5ee 0%, #f0efeb 50%, #f5f4f0 100%)',
        'gradient-card':  'linear-gradient(135deg, #f5f4f0 0%, #eeede8 100%)',
      },
      boxShadow: {
        card:        '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover':'0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
        glow:        '0 0 0 3px rgba(0,83,35,0.20)',
        'glow-sm':   '0 0 0 2px rgba(0,83,35,0.15)',
        sidebar:     '1px 0 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
} satisfies Config
