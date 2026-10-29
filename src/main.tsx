import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyMapOverrides } from './ui/mapEditor';
import App from './ui/App';
import '@fontsource/black-ops-one/400.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/special-elite/400.css';
import './ui/theme.css';
import './ui/log.css';

applyMapOverrides();

// iOS Safari ignores user-scalable=no; stop its page pinch so pinches zoom the map instead.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && location.hash === '#gallery') {
  import('./ui/dev/Gallery').then(({ default: Gallery }) => root.render(<Gallery />));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
