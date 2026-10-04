// Screenshots (2.12): fünf Bildschirme des Spiels (ab 0.2.15+6 dazu vier Kartenausschnitte) nach docs/screenshots/, um zu
// prüfen, ob die Platzhaltergrafik wie aus einem Guss wirkt.
// Aufruf: npm run screenshots  (braucht Google Chrome; startet einen eigenen
// Vite-Server auf Port 5199 und beendet ihn danach wieder).
//
// Die Spielstände entstehen wie in den Bot-Läufen: ein Bot spielt mit allen
// Ereignissen, der Stand landet im Autosave des Browsers, dann wird die Seite geladen.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { loadBalance } from '../src/sim/testBalance';
import { botTurn } from '../src/sim/bots';
import { endRound, newGame, type GameState } from '../src/sim/game';
import { Rng, seedFromString } from '../src/sim/rng';
import { serializeGame } from '../src/sim/save';
import { loadEvents } from '../src/sim/testEvents';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
const events = loadEvents();
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5199;
const DEBUG_PORT = 9333;
const OUT = new URL('docs/screenshots/', root);

/** Bot „gierig“ spielt bis Runde `bis` (oder bis zum Ende). */
function spiele(seed: string, bis: number): GameState {
  let state = newGame(seed, balance, events);
  const rng = new Rng(seedFromString(`${seed}-bot`));
  while (!state.finished && state.round < bis) {
    state = endRound(botTurn(state, balance, 'gierig', rng), balance, events);
  }
  return state;
}

function suche(pruef: (s: GameState) => boolean, bis = 99): GameState {
  for (let i = 0; i < 200; i++) {
    const s = spiele(`stil-${i}`, bis);
    if (pruef(s)) return s;
  }
  throw new Error('Kein passender Spielstand gefunden.');
}

const bilder: { name: string; state: GameState }[] = [
  { name: '1-schreibtisch-start', state: newGame('stil-0', balance, events) },
  { name: '2-schreibtisch-mitte', state: suche((s) => s.round === 6 && s.wells.length > 0, 6) },
  { name: '3-schreibtisch-spaet', state: suche((s) => s.round === 12 && s.wells.some((w) => w.status === 'found'), 12) },
  { name: '4-kapitelende', state: suche((s) => s.ending === 'kapitel') },
  { name: '5-pleite', state: suche((s) => s.ending === 'pleite') },
];

// --- Chrome über das DevTools-Protokoll steuern ---
async function warte<T>(f: () => Promise<T>, versuche = 50): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= versuche) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

class Cdp {
  private id = 0;
  private offen = new Map<number, (v: unknown) => void>();
  private ereignisse: ((m: { method: string }) => void)[] = [];
  constructor(private ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id !== undefined) this.offen.get(m.id)?.(m.result ?? m.error);
      else this.ereignisse.forEach((f) => f(m));
    });
  }
  send<T = any>(method: string, params: object = {}): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((r) => this.offen.set(id, r as (v: unknown) => void));
  }
  einmal(method: string): Promise<void> {
    return new Promise((r) => {
      const f = (m: { method: string }) => {
        if (m.method === method) {
          this.ereignisse = this.ereignisse.filter((g) => g !== f);
          r();
        }
      };
      this.ereignisse.push(f);
    });
  }
}

const server = await createServer({ root: new URL('.', root).pathname, server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const profil = mkdtempSync(join(tmpdir(), 'crude-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profil}`, '--hide-scrollbars', 'about:blank'], {
  stdio: 'ignore',
});
try {
  const ziele = await warte(async () => (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json());
  const seite = (ziele as { type: string; webSocketDebuggerUrl: string }[]).find((z) => z.type === 'page')!;
  const ws = new WebSocket(seite.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  const url = `http://localhost:${PORT}/`;
  let geladen = cdp.einmal('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await geladen;
  mkdirSync(OUT, { recursive: true });
  for (const bild of bilder) {
    const text = serializeGame(bild.state, version);
    await cdp.send('Runtime.evaluate', { expression: `localStorage.setItem('crude.autosave', ${JSON.stringify(text)})` });
    geladen = cdp.einmal('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await geladen;
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
    await new Promise((r) => setTimeout(r, 400));
    const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
    const hoehe = Math.min(Math.ceil(cssContentSize.height), 2600);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1400, height: hoehe, scale: 1 },
    });
    writeFileSync(new URL(`${bild.name}.png`, OUT), Buffer.from(data, 'base64'));
    console.log(`docs/screenshots/${bild.name}.png (Runde ${bild.state.round}${bild.state.ending ? `, ${bild.state.ending}` : ''})`);
  }
  // Karte (0.2.15+6): Ausschnitte nur der Karte – Salt Hill, Übersicht, Hinweis beim Darüberfahren.
  const karten: { name: string; state: GameState; vorher?: string }[] = [
    { name: '6-karte-salthill', state: bilder[2].state },
    { name: '9-karte-start', state: bilder[0].state },
    { name: '7-karte-uebersicht', state: bilder[1].state, vorher: `[...document.querySelectorAll('.karte-knoepfe button')].find((b) => b.textContent.includes('Übersicht')).click()` },
    {
      name: '8-karte-hinweis',
      state: bilder[1].state,
      vorher: `(() => { const r = document.querySelector('.karte-ranch'); const b = r.getBoundingClientRect(); r.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 })); })()`,
    },
  ];
  for (const karte of karten) {
    await cdp.send('Runtime.evaluate', { expression: `localStorage.setItem('crude.autosave', ${JSON.stringify(serializeGame(karte.state, version))})` });
    geladen = cdp.einmal('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await geladen;
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
    await new Promise((r) => setTimeout(r, 300));
    // Ab 0.2.15+9 liegt die Karte hinter der Wandkarte: Zeitung zu (Esc), dann K.
    await cdp.send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' })), 50)`,
    });
    await new Promise((r) => setTimeout(r, 300));
    if (karte.vorher) await cdp.send('Runtime.evaluate', { expression: karte.vorher });
    await new Promise((r) => setTimeout(r, 900));
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const k = document.querySelector('.karte'); k.scrollIntoView(); const r = k.getBoundingClientRect(); return JSON.stringify({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }); })()`,
      returnByValue: true,
    });
    const box = JSON.parse(result.value) as { x: number; y: number; w: number; h: number };
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: box.x - 4, y: box.y - 4, width: box.w + 8, height: box.h + 8, scale: 1 },
    });
    writeFileSync(new URL(`${karte.name}.png`, OUT), Buffer.from(data, 'base64'));
    console.log(`docs/screenshots/${karte.name}.png (Runde ${karte.state.round})`);
  }
  ws.close();
} finally {
  chrome.kill();
  await server.close();
}
