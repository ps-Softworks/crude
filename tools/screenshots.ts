// Screenshots (2.12, ab 0.2.15+10 für Schreibtisch, Fenster, Karte und Besuch):
// Bildschirme des Spiels nach docs/screenshots/, um zu prüfen, ob die
// Platzhaltergrafik wie aus einem Guss wirkt. Dazu prüft es, dass die Seite bei
// 1280×800, 1440×900 und 1920×1080 nie scrollt (Schreibtisch und Karte) und dass
// die Ergebnisbögen (Kapitelende, Pleite) ohne inneres Scrollen ganz zu sehen sind
// – samt „Neues Spiel“ (0.2.15+11).
// Ab 0.2.15+12 auch mit Browserleisten (1280×680, 1366×650): Schilder am Tisch
// dürfen sich nicht überdecken, ein großes Fenster liegt ganz im Bild, das Menü
// in der Kopfleiste bleibt sichtbar (auch mit Banderole), die Blase des Rundgangs
// ragt nicht hinaus.
// Phase 4 (Integration): Ein Spielstand mit allen Systemen aus Kapitel 2 und einer mit allen aus
// Kapitel 2 und 3 – freigeschaltet wie mit den Debug-Knöpfen im Menü. Der Tisch wird in allen Größen
// auf Überlappung geprüft (Schilder und Gegenstände), jedes neue Fenster einmal geöffnet und
// geprüft, dass es ganz im Bild liegt.
// Aufruf: npm run screenshots  (braucht Google Chrome; startet einen eigenen
// Vite-Server auf Port 5199 und beendet ihn danach wieder).
//
// Die Spielstände entstehen wie in den Bot-Läufen: ein Bot spielt mit allen
// Ereignissen, der Stand landet im Autosave des Browsers, dann wird die Seite
// geladen. Klicks und Tasten gehen wie beim Spieler über das DevTools-Protokoll.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { botTurn } from '../src/sim/bots';
import { deskEvents, deskMail } from '../src/sim/events';
import { endRound, newGame, type GameState } from '../src/sim/game';
import { Rng, seedFromString } from '../src/sim/rng';
import { serializeGame } from '../src/sim/save';
// Phase 4: dieselben Freischaltungen wie die Debug-Knöpfe im Menü.
import { unlockBigPipelines } from '../src/sim/bigPipeline';
import { previewBrand } from '../src/sim/brand';
import { startDiplomacy } from '../src/sim/diplomacy';
import { openExchange } from '../src/sim/exchange';
import { debugUnlockHallstead } from '../src/sim/hallsteadState';
import { previewInvestigation } from '../src/sim/investigation';
import { previewKapitel3 } from '../src/sim/kapitel3';
import { unlockRefinery } from '../src/sim/refinery';
import { previewResearch } from '../src/sim/research';
import { openStaff } from '../src/sim/staff';
import { startStocks } from '../src/sim/stocks';
import { parseStocksContent } from '../src/sim/stocksContent';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';
import { decideIpo } from '../src/sim/chapter';
import { answerSwitch, markChronicleRead, runTimeskip, startTimeskip, SWITCH_CHOICES } from '../src/sim/timeskip';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };
const events = loadEvents();
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Eigene Ports per Umgebung (z. B. SHOT_PORT=5299 SHOT_DEBUG_PORT=9433), falls ein zweiter Lauf parallel läuft (Worktrees).
const PORT = Number(process.env.SHOT_PORT ?? 5199);
const DEBUG_PORT = Number(process.env.SHOT_DEBUG_PORT ?? 9333);
const OUT = new URL('docs/screenshots/', root);
const BREIT = 1280;
const HOCH = 800;

/** Bot „gierig“ spielt bis Runde `bis` (oder bis zum Ende). */
function spiele(seed: string, bis: number): GameState {
  let state = newGame(seed, balance, events);
  const rng = new Rng(seedFromString(`${seed}-bot`));
  while (!state.finished && state.round < bis) {
    state = endRound(botTurn(state, balance, 'gierig', rng), balance, events);
  }
  return state;
}

/** Sucht über Seeds und Runden einen Spielstand, der passt. */
function suche(pruef: (s: GameState) => boolean, runden: readonly number[] = [99]): GameState {
  for (let i = 0; i < 200; i++) {
    for (const bis of runden) {
      const s = spiele(`stil-${i}`, bis);
      if (pruef(s)) return s;
    }
  }
  throw new Error('Kein passender Spielstand gefunden.');
}

const offen = (s: GameState) => deskEvents(s, balance, events);
const def = (id: string) => events.find((e) => e.id === id);
const mitBesuch = (s: GameState) => !s.finished && offen(s).some((e) => def(e.id)?.visitor);
const mitSzene = (s: GameState) => !s.finished && offen(s).some((e) => def(e.id)?.tableau);
const mitDokument = (s: GameState) => !s.finished && deskMail(s, balance, events).some((e) => e.document);

const start = newGame('stil-0', balance, events);
const mitte = suche((s) => s.round === 6 && s.wells.length > 0, [6]);
const spaet = suche((s) => s.round === 12 && s.wells.some((w) => w.status === 'found'), [12]);
const besuch = suche(mitBesuch, [3, 4, 5, 6, 7, 8]);
const szene = suche(mitSzene, [2, 3, 4, 5, 6, 7, 8, 9]);
const dokument = suche(mitDokument, [3, 4, 5, 6, 7, 8, 9, 10]);
const kapitel = suche((s) => s.ending === 'kapitel');
let bankrott: GameState | null = null;
try {
  bankrott = suche((s) => !s.finished && s.bankruptcyDeadline > 0, [4, 6, 8, 10, 12, 14]);
} catch {
  bankrott = null;
}
const pleite = suche((s) => s.ending === 'pleite');
// Zeitsprung (4.5): Kapitelende mit entschiedenem Börsengang, laufender Sprung an einer Weiche, Chronik, Kapitel 2.
const kapitelFrei = (() => {
  const r = decideIpo(kapitel, balance, 0);
  return r.ok ? r.state : kapitel;
})();
const imSprung = (() => {
  const r = startTimeskip(kapitelFrei, balance, { stance: 'balanced', family: 'some' });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
})();
const nachSprung = (() => {
  let s = imSprung;
  for (let i = 0; i < 10; i++) {
    const step = runTimeskip(s, balance, events);
    if (step.status === 'done') return step.state;
    // Zu teure Antworten sind gesperrt (4.5) – dann die andere.
    let a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id][0], events);
    if (!a.ok) a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id][1], events);
    if (!a.ok) throw new Error(a.reason);
    s = a.state;
  }
  throw new Error('Zeitsprung endet nicht.');
})();
const kapitel2 = markChronicleRead(nachSprung);

// --- Phase 4: Kapitel-2- und Kapitel-3-Systeme wie per Debug freigeschaltet ---
const stocksBoard = parseStocksContent('content/stocks.yaml', readFileSync(new URL('content/stocks.yaml', root), 'utf8'), balance.stocks.board.seatsMax).content!.board;
function kapitel2Systeme(s: GameState): GameState {
  let x = { ...s, cash: Math.max(s.cash, 400_000) };
  x = unlockRefinery(x, balance);
  x = unlockBigPipelines(x, balance, { force: true });
  x = startStocks({ ...x, ipo: x.ipo ?? { share: 0.49, proceeds: 0 } }, balance, stocksBoard, { force: true });
  x = openStaff(x, balance);
  x = startDiplomacy(x, balance, balance.diplomacy.unlockChapter);
  x = previewInvestigation(x, balance);
  return previewResearch(x);
}
function kapitel3Systeme(s: GameState): GameState {
  let x = kapitel2Systeme(s);
  x = previewBrand(x, balance);
  x = openExchange(x, balance);
  x = debugUnlockHallstead(x, balance);
  return previewKapitel3(x, balance);
}
/** Freischalten und zwei Runden weiterspielen, damit die Systeme einmal abrechnen. */
function weiter(s: GameState, runden = 2): GameState {
  const rng = new Rng(seedFromString(`${s.seed}-p4`));
  let x = s;
  for (let i = 0; i < runden && !x.finished; i++) x = endRound(botTurn(x, balance, 'ausgewogen', rng), balance, events);
  return x;
}
const p4basis = suche((s) => s.round === 6 && s.wells.length > 0 && !s.finished, [6]);
const kap2 = weiter(kapitel2Systeme(p4basis));
const kap3 = weiter(kapitel3Systeme(p4basis));
if (kap2.finished || kap3.finished) throw new Error('Phase-4-Spielstand ist vorzeitig zu Ende.');
const KLICK = (sel: string) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!el; })()`;
/** Fenster der Phase-4-Systeme, je mit dem Klick, der es öffnet. */
const P4_FENSTER: [string, string[], string][] = [
  ['Raffinerie', [], KLICK('.objekt-raffinerie')],
  ['Fernleitung', ['f'], 'REITER:Fernleitung'],
  ['Aufsichtsrat', ['g'], 'REITER:Aufsichtsrat'],
  ['Personal', [], KLICK('.objekt-personal')],
  ['Konkurrenz mit Diplomatie', [], KLICK('.objekt-konkurrenz')],
  ['Schattenbuch', [], KLICK('.objekt-schattenbuch')],
  ['Werkstatt', [], KLICK('.objekt-werkstatt')],
  ['Vertrieb', [], KLICK('.objekt-marke')],
  ['Börse', [], KLICK('.objekt-boerse')],
  ['Hallstead', [], KLICK('.objekt-hallstead')],
  ['Siegelmappe', [], KLICK('.objekt-konzern')],
];
const REITER = (text: string) =>
  `(() => { const b = [...document.querySelectorAll('.sheet [role=tab], .sheet .reiter button, .sheet button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return !!b; })()`;

interface Bild {
  name: string;
  state: GameState;
  /** Vorlieben im Browser: Zeitung, Rundgang, Einstiegshilfe, Reiter. */
  prefs?: Record<string, string>;
  /** Was in dieser Runde schon gesehen ist (ohne „auto-besuch“ kommt ein Besuch von selbst). */
  gesehen?: string[];
  /** Tasten der Reihe nach (z. B. ['k']). */
  tasten?: string[];
  /** JavaScript nach den Tasten (z. B. ein Klick). */
  dann?: string;
  warte?: number;
}

const RUHE: Record<string, string> = { 'crude.zeitung': 'aus', 'crude.rundgang': 'gesehen' };
const JACOBS_RANCH = `(() => { const r = [...document.querySelectorAll('.karte-ranch')].find((g) => /Jacobs (Pacht|Option)/.test(g.getAttribute('aria-label'))) ?? document.querySelector('.karte-ranch'); r.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`;
const DOKUMENT_VORN = `(() => { const b = [...document.querySelectorAll('.stapel-liste button')].find((x) => x.textContent.includes('mit Dokument')); b?.click(); })()`;

const bilder: Bild[] = [
  { name: '01-schreibtisch-start', state: start },
  { name: '02-schreibtisch-mitte', state: mitte },
  { name: '03-schreibtisch-spaet', state: spaet },
  { name: '04-post-dokument', state: dokument, tasten: ['b'], dann: DOKUMENT_VORN },
  { name: '05-fracht-wege', state: mitte, prefs: { 'crude.reiter.fracht': 'wege' }, tasten: ['f'] },
  { name: '06-kassenbuch', state: mitte, tasten: ['g'] },
  { name: '07-karte-ranch', state: mitte, tasten: ['k'], dann: JACOBS_RANCH, warte: 900 },
  { name: '08-besuch', state: besuch, tasten: ['w'], warte: 700 },
  { name: '09-szene', state: szene, gesehen: ['zeitung'], warte: 1400 },
  { name: '10-zeitung', state: mitte, prefs: { 'crude.zeitung': 'an' }, gesehen: [], warte: 500 },
  { name: '11-glocke', state: mitte, tasten: ['e'] },
  { name: '12-rundgang', state: start, prefs: { 'crude.rundgang': 'nein' }, warte: 1200 },
  { name: '13-kapitelende', state: kapitel },
  { name: '14-pleite', state: pleite },
  { name: '15-rundenbericht', state: mitte, prefs: { 'crude.zeitung': 'an' }, tasten: ['e', 'Enter'], warte: 1600 },
  // Phase 4 (Integration)
  { name: '16-tisch-kapitel2', state: kap2 },
  { name: '17-tisch-kapitel3', state: kap3 },
  { name: '18-raffinerie', state: kap3, dann: KLICK('.objekt-raffinerie') },
  { name: '19-fernleitung', state: kap3, tasten: ['f'], dann: REITER('Fernleitung') },
  { name: '20-aktien', state: kap3, tasten: ['g'], dann: REITER('Aufsichtsrat') },
  { name: '21-personal', state: kap3, dann: KLICK('.objekt-personal') },
  { name: '22-diplomatie', state: kap3, dann: `${KLICK('.objekt-konkurrenz')}; setTimeout(() => ${REITER('Absprachen')}, 400)`, warte: 1000 },
  { name: '23-schattenbuch', state: kap3, dann: KLICK('.objekt-schattenbuch') },
  { name: '24-werkstatt', state: kap3, dann: KLICK('.objekt-werkstatt') },
  { name: '25-marke', state: kap3, dann: KLICK('.objekt-marke') },
  { name: '26-boerse', state: kap3, dann: KLICK('.objekt-boerse') },
  { name: '27-hallstead', state: kap3, dann: KLICK('.objekt-hallstead') },
  { name: '28-konzern', state: kap3, dann: KLICK('.objekt-konzern') },
  { name: '29-zeitung-kapitel3', state: kap3, tasten: ['z'], warte: 600 },
  {
    name: '30-debug-freischalten',
    state: mitte,
    dann: `${KLICK('.menue-knopf')}; setTimeout(() => { ${REITER('Debug')}; setTimeout(() => document.querySelector('.debug-unlocks')?.scrollIntoView({ block: 'end' }), 200); }, 400)`,
    warte: 1100,
  },
  // Zeitsprung I (4.5)
  { name: '31-zeitsprung-brief', state: kapitelFrei, dann: `[...document.querySelectorAll('.bogen-fuss button')].find((b) => b.textContent.includes('Jahre'))?.click()` },
  { name: '32-zeitsprung-telegramm', state: imSprung },
  { name: '33-zeitsprung-chronik', state: nachSprung },
  { name: '34-kapitel2-schreibtisch', state: kapitel2 },
  // Termine als Hauptwerkzeug (Etappe 1): Planungsbrett mit Kartenhand.
  { name: '35-planungsbrett', state: start, prefs: { 'crude.reiter.termine': 'land' }, tasten: ['t'] },
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

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  async js<T = unknown>(expression: string): Promise<T> {
    const { result } = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return result?.value as T;
  }
  /** Eine Taste wie vom Spieler: keydown, char, keyup an das Element mit dem Fokus. */
  async taste(key: string) {
    const code = key === 'Enter' ? 13 : key === 'Escape' ? 27 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
    const text = key === 'Enter' ? '\r' : key.length === 1 ? key : undefined;
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === 'Enter' ? 'Enter' : undefined, text, windowsVirtualKeyCode: code });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code });
  }
}

// node_modules darf ein Verweis sein (z. B. in einem Git-Worktree) – dann die Schriften auch von dort ausliefern.
const erlaubt = [new URL('.', root).pathname, realpathSync(new URL('node_modules', root))];
const server = await createServer({ root: new URL('.', root).pathname, server: { port: PORT, strictPort: true, fs: { allow: erlaubt } }, logLevel: 'error' });
await server.listen();
const profil = mkdtempSync(join(tmpdir(), 'crude-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profil}`, '--hide-scrollbars', 'about:blank'], {
  stdio: 'ignore',
});
let fehler = 0;
try {
  const ziele = await warte(async () => (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json());
  const seite = (ziele as { type: string; webSocketDebuggerUrl: string }[]).find((z) => z.type === 'page')!;
  const ws = new WebSocket(seite.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  const url = `http://localhost:${PORT}/`;

  async function groesse(w: number, h: number) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  }

  async function lade(state: GameState, prefs: Record<string, string>, gesehen: string[] | undefined) {
    const szene = gesehen ?? ['zeitung', 'auto-besuch'];
    const setzen = {
      'crude.autosave': serializeGame(state, version),
      'crude.szene': JSON.stringify({ key: `${state.seed}:${state.round}`, round: state.round, seen: szene }),
      ...RUHE,
      ...prefs,
    };
    await cdp.js(`(() => { localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(setzen)})) localStorage.setItem(k, v); })()`);
    const geladen = cdp.einmal('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await geladen;
    await cdp.js('document.fonts.ready.then(() => true)');
    await pause(400);
  }

  await groesse(BREIT, HOCH);
  const erst = cdp.einmal('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await erst;
  // Der erste Aufbau schreibt noch einen eigenen Autosave – erst danach den Spielstand setzen.
  await pause(800);

  // Alte Bilder weg, damit nichts Veraltetes liegen bleibt.
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.png')) rmSync(new URL(f, OUT));

  for (const bild of bilder) {
    await lade(bild.state, bild.prefs ?? {}, bild.gesehen);
    for (const t of bild.tasten ?? []) {
      await cdp.taste(t);
      await pause(250);
    }
    if (bild.dann) {
      await pause(600);
      await cdp.js(bild.dann);
    }
    await pause(bild.warte ?? 500);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: BREIT, height: HOCH, scale: 1 } });
    writeFileSync(new URL(`${bild.name}.png`, OUT), Buffer.from(data, 'base64'));
    console.log(`docs/screenshots/${bild.name}.png (Runde ${bild.state.round}${bild.state.ending ? `, ${bild.state.ending}` : ''})`);
  }

  // Kein Seiten-Scroll (Abnahme A1): Schreibtisch und Karte in fünf Größen – zwei davon wie im Browser mit Leisten.
  const GROESSEN = [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
    [1280, 680],
    [1366, 650],
  ] as const;
  // Schilder am Tisch: kein Schild über einem anderen Gegenstand oder Ruths Zettel, kein abgeschnittener Text.
  const UEBERLAPPUNG = `(() => {
    const kasten = (el) => el.getBoundingClientRect();
    const teile = [];
    for (const o of document.querySelectorAll('.szene .objekt')) {
      for (const t of o.querySelectorAll('.namensschild, .objekt-status')) teile.push({ el: t, owner: o });
    }
    const zettel = document.querySelector('.unterlage-platz');
    if (zettel) teile.push({ el: zettel, owner: zettel });
    const fehler = [];
    for (let i = 0; i < teile.length; i++) for (let j = i + 1; j < teile.length; j++) {
      if (teile[i].owner === teile[j].owner) continue;
      const a = kasten(teile[i].el), b = kasten(teile[j].el);
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 2 && y > 2) fehler.push((teile[i].el.textContent || '').trim().slice(0, 24) + ' ↔ ' + (teile[j].el.textContent || '').trim().slice(0, 24));
    }
    for (const t of document.querySelectorAll('.szene .namensschild, .szene .objekt-status')) {
      if (t.scrollWidth > t.clientWidth + 1) fehler.push('abgeschnitten: ' + (t.textContent || '').trim().slice(0, 30));
    }
    const vw = innerWidth, vh = innerHeight;
    for (const t of document.querySelectorAll('.szene .objekt, .unterlage-platz')) {
      const r = kasten(t);
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) fehler.push('außerhalb: ' + (t.getAttribute('aria-label') || t.className).slice(0, 30));
    }
    return fehler;
  })()`;
  // Phase 4: Gegenstände selbst (nicht nur ihre Schilder) liegen nicht übereinander.
  const KOERPER = `(() => {
    const teile = [...document.querySelectorAll('.szene .objekt')].map((el) => ({ el, r: el.getBoundingClientRect() }));
    const zettel = document.querySelector('.unterlage-platz');
    if (zettel) teile.push({ el: zettel, r: zettel.getBoundingClientRect() });
    const fehler = [];
    for (let i = 0; i < teile.length; i++) for (let j = i + 1; j < teile.length; j++) {
      const a = teile[i].r, b = teile[j].r;
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 4 && y > 4) fehler.push('Gegenstände: ' + (teile[i].el.getAttribute('aria-label') || teile[i].el.className).slice(0, 24) + ' ↔ ' + (teile[j].el.getAttribute('aria-label') || teile[j].el.className).slice(0, 24));
    }
    return fehler;
  })()`;
  // Ein Fenster ganz im Bild (Titel, X und unterer Rand) und das Menü in der Kopfleiste sichtbar.
  const IM_BILD = (sel: string) =>
    `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'fehlt'; const r = el.getBoundingClientRect(); return r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 ? 'ok' : Math.round(r.left) + ',' + Math.round(r.top) + '–' + Math.round(r.right) + ',' + Math.round(r.bottom); })()`;
  for (const [w, h] of GROESSEN) {
    await groesse(w, h);
    for (const ansicht of ['Schreibtisch', 'Karte'] as const) {
      await lade(spaet, {}, undefined);
      if (ansicht === 'Karte') {
        await cdp.taste('k');
        await pause(700);
      }
      const m = await cdp.js<{ sh: number; sw: number; ih: number; iw: number; klein: number }>(
        `(() => { const e = document.documentElement; const klein = [...document.querySelectorAll('.namensschild, .objekt-status, .kopfleiste, .sheet')].filter((x) => parseFloat(getComputedStyle(x).fontSize) < 15).length; return { sh: e.scrollHeight, sw: e.scrollWidth, ih: innerHeight, iw: innerWidth, klein }; })()`,
      );
      const ok = m.sh <= m.ih && m.sw <= m.iw;
      if (!ok) fehler++;
      console.log(`${ok ? 'ok    ' : 'FEHLER'} ${w}×${h} ${ansicht}: Seite ${m.sw}×${m.sh}${m.klein > 0 ? ` · ${m.klein} Schrift unter 15 px` : ''}`);
      if (ansicht === 'Schreibtisch') {
        const ueber = await cdp.js<string[]>(UEBERLAPPUNG);
        if (ueber.length > 0) fehler++;
        console.log(`${ueber.length === 0 ? 'ok    ' : 'FEHLER'} ${w}×${h} Schilder: ${ueber.length === 0 ? 'nichts überdeckt' : ueber.join(' · ')}`);
        const menue = await cdp.js<string>(IM_BILD('.menue-knopf'));
        if (menue !== 'ok') fehler++;
        console.log(`${menue === 'ok' ? 'ok    ' : 'FEHLER'} ${w}×${h} Menü-Knopf: ${menue}`);
        // Ein großes Fenster (Kassenbuch) liegt ganz im Bild.
        await cdp.taste('g');
        await pause(400);
        const fenster = await cdp.js<string>(IM_BILD('.sheet'));
        if (fenster !== 'ok') fehler++;
        console.log(`${fenster === 'ok' ? 'ok    ' : 'FEHLER'} ${w}×${h} Fenster Kassenbuch: ${fenster}`);
      }
    }
    // Phase 4: Tisch mit allen Kapitel-2- bzw. Kapitel-2/3-Systemen – Schilder und Gegenstände überdecken sich nicht.
    for (const [name, state] of [
      ['Kapitel 2', kap2],
      ['Kapitel 3', kap3],
    ] as const) {
      await lade(state, {}, undefined);
      const m = await cdp.js<{ sh: number; sw: number; ih: number; iw: number }>(
        `(() => { const e = document.documentElement; return { sh: e.scrollHeight, sw: e.scrollWidth, ih: innerHeight, iw: innerWidth }; })()`,
      );
      const ueber = [...(await cdp.js<string[]>(UEBERLAPPUNG)), ...(await cdp.js<string[]>(KOERPER))];
      if (m.sh > m.ih || m.sw > m.iw) ueber.push(`Seite ${m.sw}×${m.sh}`);
      if (ueber.length > 0) fehler++;
      console.log(`${ueber.length === 0 ? 'ok    ' : 'FEHLER'} ${w}×${h} Tisch ${name}: ${ueber.length === 0 ? 'nichts überdeckt' : ueber.join(' · ')}`);
      if (name === 'Kapitel 3' && (h < 800 || w === 1920)) {
        for (const [fenster, tasten, klick] of P4_FENSTER) {
          await lade(state, {}, undefined);
          for (const t of tasten) {
            await cdp.taste(t);
            await pause(250);
          }
          const offen = await cdp.js<boolean>(klick.startsWith('REITER:') ? REITER(klick.slice(7)) : klick);
          await pause(400);
          const r = offen ? await cdp.js<string>(IM_BILD('.sheet')) : 'nicht gefunden';
          if (r !== 'ok') fehler++;
          console.log(`${r === 'ok' ? 'ok    ' : 'FEHLER'} ${w}×${h} Fenster ${fenster}: ${r}`);
        }
      }
    }
    // Banderole „Bankrott droht“: das Menü bleibt sichtbar (mit Debug-Anzeige erst recht eng).
    if (bankrott) {
      await lade(bankrott, {}, undefined);
      const b = await cdp.js<string>(IM_BILD('.menue-knopf'));
      if (b !== 'ok') fehler++;
      console.log(`${b === 'ok' ? 'ok    ' : 'FEHLER'} ${w}×${h} Menü-Knopf mit Banderole: ${b}`);
    }
  }
  // Rundgang: die Blase des letzten Schritts (Glocke) liegt ganz im Bild.
  for (const [w, h] of [GROESSEN[0], GROESSEN[3]]) {
    await groesse(w, h);
    await lade(start, { 'crude.rundgang': 'nein' }, undefined);
    await pause(900);
    for (let i = 0; i < 20; i++) {
      const fertig = await cdp.js<boolean>(`[...document.querySelectorAll('.rundgang-blase button')].some((b) => b.textContent.includes('Fertig'))`);
      if (fertig) break;
      await cdp.taste('ArrowRight');
      await pause(150);
    }
    await pause(300);
    const r = await cdp.js<string>(IM_BILD('.rundgang-blase'));
    if (r !== 'ok') fehler++;
    console.log(`${r === 'ok' ? 'ok    ' : 'FEHLER'} ${w}×${h} Rundgang, letzte Blase: ${r}`);
  }
  // Ergebnisbögen (0.2.15+11): kein inneres Scrollen, „Neues Spiel“ sichtbar.
  for (const [w, h] of [
    [1280, 800],
    [1920, 1080],
  ] as const) {
    await groesse(w, h);
    for (const [name, state, knopfText] of [
      ['Kapitelende', kapitel, 'Neues Spiel'],
      ['Pleite', pleite, 'Neues Spiel'],
      ['Chronik nach dem Zeitsprung', nachSprung, 'Schreibtisch'],
    ] as const) {
      await lade(state, {}, undefined);
      const m = await cdp.js<{ innen: number; sicht: number; knopf: boolean }>(
        `(() => { const i = document.querySelector('.bogen-inhalt'); const k = [...document.querySelectorAll('.bogen-fuss button')].find((b) => b.textContent.includes(${JSON.stringify(knopfText)})); const r = k?.getBoundingClientRect(); return { innen: i ? i.scrollHeight : 0, sicht: i ? i.clientHeight : 0, knopf: !!r && r.bottom <= innerHeight && r.top >= 0 }; })()`,
      );
      const ok = m.innen <= m.sicht + 1 && m.knopf;
      if (!ok) fehler++;
      console.log(`${ok ? 'ok    ' : 'FEHLER'} ${w}×${h} ${name}: Inhalt ${m.innen} von ${m.sicht} px${m.knopf ? '' : ` · „${knopfText}“ nicht sichtbar`}`);
    }
  }
  ws.close();
} finally {
  chrome.kill();
  await server.close();
}
if (fehler > 0) {
  console.error(`${fehler} Ansicht(en) scrollen oder verstecken Knöpfe – das darf nicht sein.`);
  process.exit(1);
}
