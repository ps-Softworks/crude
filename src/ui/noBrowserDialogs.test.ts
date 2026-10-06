// Wache (0.4.20+1): window.confirm, alert und prompt sind im abgeschotteten iframe
// (Claude-Artefakt, itch.io) gesperrt – confirm liefert dort still „nein“, und „Neues Spiel“
// tat nichts. Rückfragen laufen über ConfirmButton. Dieser Test sucht den Code danach ab.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const pfad = join(dir, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [pfad] : [];
  });
}

/** Aufrufe wie window.confirm(…), alert(…), globalThis.prompt(…) – nicht onConfirm(…) oder confirmKey(…). */
const VERBOTEN = /(?<![\w$.])(?:(?:window|globalThis|self|top|parent)\s*\.\s*)?(confirm|alert|prompt)\s*\(|\b(?:window|globalThis|self)\s*\.\s*(confirm|alert|prompt)\b/;

describe('Keine Browser-Dialoge im Spiel', () => {
  it('findet die verbotenen Aufrufe (Selbstprobe)', () => {
    for (const z of ["window.confirm('x')", 'alert(1)', 'if (!confirm(t)) return;', 'globalThis.prompt("?")', 'const c = window.confirm;']) {
      expect(VERBOTEN.test(z), z).toBe(true);
    }
    for (const z of ['onConfirm()', 'confirmKey(e.key, false)', 'p.onRestart()', 'confirm && x', "question={confirm}", 'setAlert(true)']) {
      expect(VERBOTEN.test(z), z).toBe(false);
    }
  });

  it('src/ui und src/sim rufen weder window.confirm noch alert noch prompt auf', () => {
    const funde: string[] = [];
    for (const datei of [...dateien(join(ROOT, 'ui')), ...dateien(join(ROOT, 'sim'))]) {
      // Kommentare zählen nicht (Zeilen bleiben erhalten, damit die Nummern stimmen).
      readFileSync(datei, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .split('\n')
        .forEach((zeile, i) => {
          const code = zeile.replace(/\/\/.*$/, '');
          if (VERBOTEN.test(code)) funde.push(`${relative(ROOT, datei)}:${i + 1}: ${zeile.trim()}`);
        });
    }
    expect(funde, 'Bitte ConfirmButton (src/ui/ConfirmButton.tsx) statt Browser-Dialog verwenden').toEqual([]);
  });
});
