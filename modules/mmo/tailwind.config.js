/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        inter: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        app: {
          bg: 'var(--bg-primary)',
          'bg-sub': 'var(--bg-secondary)',
          surface: 'var(--surface-primary)',
          'surface-muted': 'var(--surface-muted)',
          'surface-card': 'var(--surface-card)',
          border: 'var(--border)',
          'surface-border': 'var(--surface-border)',
          'surface-hover': 'var(--surface-hover)',
          text: 'var(--text-primary)',
          'text-sub': 'var(--text-secondary)',
          accent: 'var(--accent)',
          'accent-strong': 'var(--accent-strong)',
          'accent-contrast': 'var(--accent-contrast)',
          success: 'var(--success)',
          danger: 'var(--danger)',
          warning: 'var(--warning)',
          info: 'var(--info)',
          'icon-bg': 'var(--icon-box-bg)',
          'icon-border': 'var(--icon-box-border)',
          'icon-text': 'var(--icon-box-text)',
        }
      },
      height: {
        'topbar': 'var(--top-bar-height)',
        'bottomnav': 'var(--bottom-nav-height)',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
      borderRadius: {
        'app': 'var(--border-radius)',
        'app-sm': 'var(--border-radius-sm)',
      },
      boxShadow: {
        'surface': 'var(--surface-shadow)',
        'accent': 'var(--accent-shadow)',
        'accent-strong': 'var(--accent-shadow-strong)',
      }
    },
  },
  plugins: [],
}

