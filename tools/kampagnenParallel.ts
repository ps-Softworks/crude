// Kampagnen-Bots auf mehreren Kernen (0.4.20+6): Die Seeds werden auf jobs Prozesse verteilt (je ein
// tools/kampagnenWorker.ts), jeder schreibt seine Ergebnisse als JSON; zusammengeführt wird in Saat-Reihenfolge.
// Jede Saat ist für sich deterministisch – das Ergebnis ist dasselbe wie mit einem Prozess.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { campaignReportFrom, type CampaignReport, type CampaignSeedResult } from '../src/sim/campaignBots';

const root = fileURLToPath(new URL('../', import.meta.url));
const worker = fileURLToPath(new URL('./kampagnenWorker.ts', import.meta.url));

/** Balance-Änderung im Speicher: tiefes Zusammenführen (Listen und Werte ersetzen). */
export function mergeBalance<T>(a: T, b: unknown): T {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b as T;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b)) out[k] = mergeBalance((a as Record<string, unknown> | undefined)?.[k], v);
  return out as T;
}

export async function runCampaignParallel(games: number, jobs: number, override = '{}', onProgress?: (done: number) => void): Promise<CampaignReport> {
  return campaignReportFrom(await runCampaignSeedsParallel(games, jobs, override, onProgress));
}

/** Die Rohergebnisse je Saat (in Saat-Reihenfolge) – für Auswertungen über den Bericht hinaus (tools/siegAnalyse.ts). */
export async function runCampaignSeedsParallel(games: number, jobs: number, override = '{}', onProgress?: (done: number) => void): Promise<CampaignSeedResult[]> {
  const dir = mkdtempSync(join(tmpdir(), 'crude-kampagne-'));
  const n = Math.max(1, Math.min(jobs, games));
  const teile = Array.from({ length: n }, (_, j) => ({ from: Math.floor((games * j) / n), to: Math.floor((games * (j + 1)) / n), out: join(dir, `teil-${j}.json`) }));
  let fertig = 0;
  try {
    await Promise.all(
      teile.map(
        (t) =>
          new Promise<void>((resolve, reject) => {
            const p = spawn(process.execPath, ['--import', 'tsx', worker, String(t.from), String(t.to), t.out, override], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
            let fehler = '';
            p.stderr.on('data', (d: Buffer) => {
              const text = d.toString();
              for (const zeile of text.split('\n')) {
                if (zeile === '+') {
                  fertig += 1;
                  onProgress?.(fertig);
                } else if (zeile.trim() !== '') fehler += zeile + '\n';
              }
            });
            p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Kampagnen-Teil ${t.from}–${t.to} brach ab (${code}):\n${fehler}`))));
          }),
      ),
    );
    return teile.flatMap((t) => JSON.parse(readFileSync(t.out, 'utf8')) as CampaignSeedResult[]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
