import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyMapOverrides } from './ui/mapEditor';
import App from './ui/App';
import './ui/styles.css';

applyMapOverrides();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
