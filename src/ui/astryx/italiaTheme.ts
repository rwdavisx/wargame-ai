// The game's look as an Astryx theme: the Italian campaign of 1943. Walnut and umber panels framed in gilt,
// travertine text, terracotta for danger, olive for success; Roman inscriptional capitals (Cinzel) for headings,
// a condensed sans for figures and controls. Built on the neutral theme; the game always runs dark.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

const ink = '#120d09';
const walnut = '#1d1610';
const walnut2 = '#271e16';
const walnut3 = '#33281d';
const gilt = '#d6ad52';
const giltLight = '#f0d48a';
const travertine = '#ece2c8';
const muted = '#ad9f84';
const terracotta = '#c4562f';

export const italiaTheme = defineTheme({
  name: 'italia',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Barlow', fallbacks: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    heading: { family: 'Cinzel', fallbacks: '"Trajan Pro", Georgia, serif', weights: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' } },
    code: { family: 'IM Fell English', fallbacks: 'Georgia, serif' },
  },
  radius: { base: 3, multiplier: 1 },
  tokens: {
    '--color-background-body': ink,
    '--color-background-surface': walnut,
    '--color-background-card': walnut2,
    '--color-background-popover': walnut2,
    '--color-background-muted': walnut3,

    '--color-accent': gilt,
    '--color-accent-muted': 'rgba(214, 173, 82, 0.16)',
    '--color-on-accent': '#1f1506',
    '--color-neutral': 'rgba(236, 226, 200, 0.07)',

    '--color-overlay': 'rgba(10, 7, 5, 0.74)',
    '--color-overlay-hover': 'rgba(240, 212, 138, 0.08)',
    '--color-overlay-pressed': 'rgba(240, 212, 138, 0.16)',

    '--color-text-primary': travertine,
    '--color-text-secondary': muted,
    '--color-text-disabled': '#6f6450',
    '--color-text-accent': giltLight,
    '--color-icon-accent': gilt,
    '--color-icon-primary': travertine,
    '--color-icon-secondary': muted,

    '--color-success': '#a8c06a',
    '--color-error': '#e8835f',
    '--color-warning': '#e9bf6a',
    '--color-success-muted': 'rgba(143, 174, 78, 0.18)',
    '--color-error-muted': 'rgba(196, 86, 47, 0.22)',
    '--color-warning-muted': 'rgba(233, 191, 106, 0.18)',
    '--color-on-success': '#18210a',
    '--color-on-error': '#fff4ec',

    '--color-border': 'rgba(214, 173, 82, 0.26)',
    '--color-border-emphasized': 'rgba(214, 173, 82, 0.55)',
    '--color-shadow': 'rgba(0, 0, 0, 0.6)',
  },
  components: {
    button: {
      base: { textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif', fontWeight: '700' },
    },
    toast: {
      base: { backgroundColor: walnut2, color: travertine, borderColor: 'rgba(214, 173, 82, 0.45)', borderWidth: '1px', borderStyle: 'solid', borderLeftWidth: '3px', borderLeftColor: gilt },
    },
    'toggle-button': {
      base: { textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif', fontWeight: '700' },
      isPressed: { backgroundColor: gilt, color: '#1f1506', borderColor: giltLight },
    },
    'selectable-card': {
      base: { borderColor: 'var(--color-border)' },
      selected: { borderColor: gilt, boxShadow: `inset 0 0 0 1px ${gilt}, 0 0 24px rgba(214, 173, 82, 0.2)` },
    },
  },
});

/** Terracotta, for the destructive and attack actions styled outside Astryx. */
export const TERRACOTTA = terracotta;
