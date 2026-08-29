/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#7C3AED',
        'primary-light': '#A78BFA',
        'primary-dark': '#6D28D9',
        secondary: '#EC4899',
        'secondary-light': '#F472B6',
        'secondary-dark': '#DB2777',
        success: '#10B981',
        'success-dark': '#059669',
        warning: '#F59E0B',
        'warning-dark': '#d97706',
        danger: '#EF4444',
        'danger-dark': '#dc2626',
        accent: '#06B6D4',
        'accent-light': '#22D3EE',
        sakura: '#FFB7C5',
        'sakura-dark': '#FF8FAB',
        mint: '#A7F3D0',
        lavender: '#C4B5FD',
      },
      animation: {
        'bounce-soft': 'bounce-soft 2s infinite',
        'pulse-soft': 'pulse-soft 2s infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'wiggle': 'wiggle 0.3s ease-in-out',
        'sparkle': 'sparkle 1.5s ease-in-out infinite',
      },
      keyframes: {
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'glow': {
          '0%': { boxShadow: '0 0 5px rgba(124, 58, 237, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(124, 58, 237, 0.6)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'wiggle': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-3deg)' },
          '75%': { transform: 'rotate(3deg)' },
        },
        'sparkle': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.95)' },
        },
      },
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
