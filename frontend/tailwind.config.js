/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#8e4e14',
        'primary-container': '#e89858',
        'primary-fixed': '#ffdcc4',
        'primary-fixed-dim': '#ffb780',
        'on-primary': '#ffffff',
        'on-primary-container': '#643200',
        secondary: '#4e5e81',
        'secondary-container': '#c4d4fd',
        surface: '#fff9ed',
        'surface-container': '#f3ede1',
        'surface-variant': '#e8e2d6',
        'surface-container-high': '#ede7dc',
        'on-surface': '#1c1b1f',
        'on-surface-variant': '#4d4640',
        tertiary: '#006879',
        'tertiary-fixed': '#a8edff',
        outline: '#7f7167',
        'soft-mint': '#B4EBDC',
        'clay-blush': '#F2C4B3',
        navy: '#1A2B4B',
        cream: '#F9F6F1',
      },
      fontFamily: {
        headline: ['"Libre Caslon Text"', 'Georgia', 'serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['4rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'headline-lg': ['3rem', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        'headline-md': ['2rem', { lineHeight: '1.25' }],
        'body-lg': ['1.125rem', { lineHeight: '1.75' }],
        'label-caps': ['0.75rem', { lineHeight: '1.33', letterSpacing: '0.1em' }],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        30: '7.5rem',
        section: '7.5rem',
        'section-sm': '4rem',
      },
      maxWidth: {
        container: '1280px',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.7s ease forwards',
        'scale-in': 'scaleIn 0.6s ease forwards',
        float: 'float 8s ease-in-out infinite',
        'ken-burns': 'kenBurns 25s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-15px)' },
        },
        kenBurns: {
          from: { transform: 'scale(1)' },
          to: { transform: 'scale(1.15)' },
        },
      },
    },
  },
  plugins: [],
};
