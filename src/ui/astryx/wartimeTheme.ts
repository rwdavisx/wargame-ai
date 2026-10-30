// The game's look as an Astryx theme: field-olive surfaces, brass accents, condensed stencil-era type.
// Built on the neutral theme; the game always runs dark, so tokens carry the dark values only.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

const ink = '#0e110f';
const olive = '#171b18';
const olive2 = '#1f241f';
const olive3 = '#2a302a';
const brass = '#d8b45a';
const brassLight = '#f2d78f';
const paper = '#ece6d6';
const muted = '#a6a391';

export const wartimeTheme = defineTheme({
  name: 'wartime',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Barlow', fallbacks: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    heading: { family: 'Barlow Condensed', fallbacks: '"Arial Narrow", system-ui, sans-serif', weights: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' } },
    code: { family: 'Special Elite', fallbacks: '"Courier New", monospace' },
  },
  radius: { base: 4, multiplier: 1 },
  tokens: {
    '--color-background-body': ink,
    '--color-background-surface': olive,
    '--color-background-card': olive2,
    '--color-background-popover': olive2,
    '--color-background-muted': olive3,

    '--color-accent': brass,
    '--color-accent-muted': 'rgba(216, 180, 90, 0.16)',
    '--color-on-accent': '#1d1608',
    '--color-neutral': 'rgba(255, 255, 255, 0.07)',

    '--color-overlay': 'rgba(4, 6, 5, 0.72)',
    '--color-overlay-hover': 'rgba(242, 215, 143, 0.08)',
    '--color-overlay-pressed': 'rgba(242, 215, 143, 0.16)',

    '--color-text-primary': paper,
    '--color-text-secondary': muted,
    '--color-text-disabled': '#6d6b5f',
    '--color-text-accent': brassLight,
    '--color-icon-accent': brass,
    '--color-icon-primary': paper,
    '--color-icon-secondary': muted,

    '--color-success': '#8fcf7a',
    '--color-error': '#f08a78',
    '--color-warning': '#f2c27a',
    '--color-success-muted': 'rgba(108, 191, 92, 0.18)',
    '--color-error-muted': 'rgba(214, 90, 67, 0.2)',
    '--color-warning-muted': 'rgba(242, 181, 68, 0.18)',
    '--color-on-success': '#0d2617',
    '--color-on-error': '#fff4ee',

    '--color-border': 'rgba(216, 180, 90, 0.22)',
    '--color-border-emphasized': 'rgba(216, 180, 90, 0.5)',
    '--color-shadow': 'rgba(0, 0, 0, 0.55)',
  },
  components: {
    button: {
      base: { textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-family-heading)', fontWeight: '600' },
    },
    'toggle-button': {
      base: { textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-family-heading)', fontWeight: '600' },
      isPressed: { backgroundColor: brass, color: '#1d1608', borderColor: brassLight },
    },
    'selectable-card': {
      base: { borderColor: 'var(--color-border)' },
      selected: { borderColor: brass, boxShadow: `inset 0 0 0 1px ${brass}, 0 0 22px rgba(216, 180, 90, 0.18)` },
    },
  },
});
