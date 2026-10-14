/** @type {import('tailwindcss').Config} */

// Every colour resolves through a CSS variable holding space-separated RGB
// channels, so `/opacity` modifiers keep working and the dark theme is a
// variable swap (see src/styles/tokens.css).
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('c-bg'),
        surface: token('c-surface'),
        border: token('c-border'),
        'border-strong': token('c-border-strong'),
        divider: token('c-divider'),
        ink: token('c-ink'),
        'ink-invert': token('c-ink-invert'),
        muted: token('c-muted'),
        primary: token('c-primary'),
        'primary-soft': token('c-primary-soft'),
        'primary-ink': token('c-primary-ink'),
        negative: token('c-negative'),
        'negative-soft': token('c-negative-soft'),
        'negative-ink': token('c-negative-ink'),
        warning: token('c-warning'),
        'warning-soft': token('c-warning-soft'),
        'warning-ink': token('c-warning-ink'),
        lock: token('c-lock'),
        'lock-ink': token('c-lock-ink'),
        'lock-muted': token('c-lock-muted'),
        'lock-key': token('c-lock-key'),
        'lock-dot': token('c-lock-dot'),
        'lock-tile': token('c-lock-tile'),
        'lock-accent': token('c-lock-accent'),
        'lock-alert': token('c-lock-alert'),
        contrast: token('c-contrast'),
        'contrast-ink': token('c-contrast-ink'),
        'negative-on-contrast': token('c-negative-on-contrast'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Mockup scale.
        label: ['12px', { lineHeight: '1.3', letterSpacing: '.06em', fontWeight: '600' }],
        meta: ['13px', { lineHeight: '1.35' }],
        base: ['15px', { lineHeight: '1.4' }],
        // Form fields are a point larger than body text on purpose: iOS
        // Safari zooms the page when a focused control is under 16px.
        input: ['16px', { lineHeight: '1.4' }],
        title: ['17px', { lineHeight: '1.3' }],
        'screen-sub': ['18px', { lineHeight: '1.3' }],
        screen: ['26px', { lineHeight: '1.2' }],
        hero: ['38px', { lineHeight: '1.1', letterSpacing: '-.02em' }],
      },
      borderRadius: {
        card: '18px',
        btn: '14px',
        ctl: '12px',
      },
      spacing: {
        tab: '80px', // bottom tab bar height
        touch: '44px', // minimum touch target
      },
      boxShadow: {
        fab: '0 8px 20px rgb(var(--c-primary) / .28)',
        sheet: '0 -8px 32px rgb(0 0 0 / .18)',
      },
      maxWidth: {
        screen: '430px', // phone-first canvas, mockups are 390px
      },
    },
  },
  plugins: [],
}
