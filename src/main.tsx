import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyMapOverrides } from './ui/mapEditor';
import App from './ui/App';
import { Theme } from '@astryxdesign/core/theme';
import { ToastViewport } from '@astryxdesign/core/Toast';
import { italiaTheme } from './ui/astryx/italiaTheme';
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/im-fell-english/latin-400.css';
import '@fontsource/im-fell-english/latin-400-italic.css';
import './ui/astryx/astryx.css';
import './ui/theme.css';
import './ui/log.css';
import './ui/qol.css';
import './ui/italia.css';

applyMapOverrides();

// The theme on the page itself, so Astryx pieces drawn outside the app's tree (toasts) are themed too.
document.documentElement.setAttribute('data-astryx-theme', 'wartime');
document.documentElement.setAttribute('data-theme', 'dark');

// iOS Safari ignores user-scalable=no; stop its page pinch so pinches zoom the map instead.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && location.hash === '#gallery') {
  import('./ui/dev/Gallery').then(({ default: Gallery }) => root.render(<Gallery />));
} else {
  root.render(
    <StrictMode>
      <Theme theme={italiaTheme} mode="dark">
        <App />
        <ToastViewport position="topEnd" inset={{ top: 70 }} />
      </Theme>
    </StrictMode>,
  );
}
