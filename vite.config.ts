import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Die Versionsnummer steht nur in package.json und wird hier ins Spiel gereicht.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative Pfade: Der Tester-Build läuft auf itch.io in einem iframe unter
  // einem Unterpfad und muss auch als entpackter Ordner funktionieren.
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Die Viel-Seed-Läufe (Post, Bohren, Rivalen, Rundgang) brauchen allein 3–5 s; unter Last
    // (mehrere Läufe gleichzeitig) rissen sie die 5-s-Grenze von Vitest. Phase 4.
    testTimeout: 30_000,
  },
});
