import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Eine Schrift für alles (2.12): EB Garamond, lokal gebündelt (SIL Open Font License).
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-600.css';
import '@fontsource/eb-garamond/latin-700.css';
import './style.css';
import './scene/scene.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
