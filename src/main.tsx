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

applyMapOverrides();

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
