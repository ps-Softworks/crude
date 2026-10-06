import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { watchStageScale } from './stage';
// Eine Schrift für alles (2.12): EB Garamond, lokal gebündelt (SIL Open Font License).
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-600.css';
import '@fontsource/eb-garamond/latin-700.css';
import './style.css';
import './scene/scene.css';
import { getSettings } from './settings';
import { armSound } from './sound';

// Große Bildschirme: die ganze Bühne wächst gleichmäßig mit (0.2.15+11).
watchStageScale();
// Einstellungen (Textgröße, weniger Animation, Karte) gleich zu Beginn anwenden; Ton erst nach der ersten Bedienung.
getSettings();
armSound();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
