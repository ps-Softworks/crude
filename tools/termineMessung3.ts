// Messung „Termine als Hauptwerkzeug“, Etappe 3 (Plan: Abnahme Etappe 3): Briefe und Ereignisse
// ausdünnen und an Jacobs Pläne koppeln. Spielt den Standard-Bot (ausgewogen) mit allen Ereignissen
// über viele Seeds in zwei Varianten:
//   voreingestellt   wie in balance.yaml (bots.plans: verhandelt mit Thorne, sonst keine Preis-/Fracht-Karte),
//   alle Karten      dazu Förderbremse, Liefervertrag, Gerücht, Crane, Brennan, Transportgemeinschaft –
//                    ein Spieler, der seine Termine für Pläne nutzt.
// Gemessen: Größe des Kapitel-1-Katalogs, Ø Briefe (Post) je Runde, Ø alles, was auf den Tisch kommt,
// Anteil der Briefe ab Runde 6, die an Merkzeichen aus Jacobs Plänen hängen (src/sim/letters.ts,
// coupledEvents), höchstens ein Thorne-Brief je Runde. Kapitel-1-Zielwerte: npm run bots.
// Aufruf: npx tsx tools/termineMessung3.ts [Seeds] – schreibt nur mit „--schreiben“ nach docs/plan-termine-messung.md.
import { readFileSync, writeFileSync } from 'node:fs';
import type { Balance } from '../src/sim/balance';
import { botTurn, newLedger } from '../src/sim/bots';
import { parseEventFile } from '../src/sim/eventContent';
import { endRound, newGame, type GameState } from '../src/sim/game';
import { coupledEvents, LETTER_MARKS } from '../src/sim/letters';
import type { BotPlans } from '../src/sim/pricingBalance';
import { Rng, seedFromString } from '../src/sim/rng';
import { loadBalance } from '../src/sim/testBalance';
import { EVENTS_DIR, loadEvents, readEventFiles } from '../src/sim/testEvents';

const root = new URL('../', import.meta.url);
const balance = loadBalance();
const catalog = loadEvents();
const byId = new Map(catalog.map((e) => [e.id, e]));
const gekoppelt = coupledEvents(catalog);
const seeds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 500);
const schreiben = process.argv.includes('--schreiben');
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string };

// Katalog Kapitel 1: alle Ereignisse in content/events/k1-*.yaml, die in Kapitel 1 kommen können.
const k1 = readEventFiles(EVENTS_DIR)
  .filter((f) => f.file.includes('/k1-'))
  .flatMap((f) => parseEventFile(f.file, f.text).events)
  .filter((e) => (e.conditions.minChapter ?? 1) <= 1);
const k1Briefe = k1.filter((e) => e.mail);
const KATALOG_VORHER = 122; // main 0.4.5+1 (Plan: „Der Katalog umfasst 122 Ereignisse“)

const prozent = (x: number) => `${(x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const zahl = (x: number, d = 2) => x.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });

const ALLE: BotPlans = { cartel: true, contract: true, rumour: true, crane: true, thorne: true, brennan: true, pool: true };
const VARIANTEN: Record<'voreingestellt' | 'alleKarten', Balance> = {
  voreingestellt: balance,
  alleKarten: { ...balance, botPlans: { ...balance.botPlans, balanced: ALLE } },
};

interface Zaehlung {
  runden: number;
  post: number;
  tisch: number;
  spaetPost: number;
  spaetPostGekoppelt: number;
  spaetTisch: number;
  spaetTischGekoppelt: number;
  thorneMax: number;
  haeufig: Map<string, number>;
}

function messen(b: Balance): Zaehlung {
  const z: Zaehlung = { runden: 0, post: 0, tisch: 0, spaetPost: 0, spaetPostGekoppelt: 0, spaetTisch: 0, spaetTischGekoppelt: 0, thorneMax: 0, haeufig: new Map() };
  for (let i = 0; i < seeds; i++) {
    const seed = `${balance.bots.seedPrefix}-${i}`;
    let state: GameState = newGame(seed, b, catalog);
    const rng = new Rng(seedFromString(`${seed}-bot`));
    const ledger = newLedger();
    const zaehle = (s: GameState) => {
      z.runden++;
      let thorne = 0;
      // Was in dieser Runde neu auf den Tisch kam: lastSeen trägt die Runde des Eintreffens.
      for (const [id, r] of Object.entries(s.events.lastSeen)) {
        if (id.startsWith('@') || r !== s.round) continue;
        const e = byId.get(id);
        if (!e || e.routine) continue;
        // Thornes Frachtvertrag kommt nach dem ersten Besuch – oder spätestens von selbst: Er hängt nur an
        // Jacobs Plan, wenn Jacob vorher wirklich bei Thorne war.
        const g = gekoppelt.has(id) || (e.marked.includes(LETTER_MARKS.thorneMet) && (s.freight?.visits ?? 0) > 0);
        z.tisch++;
        z.haeufig.set(id, (z.haeufig.get(id) ?? 0) + 1);
        if (e.mail) {
          z.post++;
          if (e.rival === 'thorne') thorne++;
        }
        if (s.round >= 6) {
          z.spaetTisch++;
          if (g) z.spaetTischGekoppelt++;
          if (e.mail) {
            z.spaetPost++;
            if (g) z.spaetPostGekoppelt++;
          }
        }
      }
      z.thorneMax = Math.max(z.thorneMax, thorne);
    };
    zaehle(state);
    while (!state.finished) {
      const g = botTurn(state, b, 'ausgewogen', rng, catalog, ledger);
      state = endRound(g, b, catalog);
      if (!state.finished) zaehle(state);
    }
  }
  return z;
}

const start = Date.now();
const ergebnis = { voreingestellt: messen(VARIANTEN.voreingestellt), alleKarten: messen(VARIANTEN.alleKarten) };
const a = ergebnis.alleKarten;
const v = ergebnis.voreingestellt;
const anteil = (x: number, n: number) => (n > 0 ? x / n : 0);
const tabelle = [
  '| Kriterium | Ziel (Plan) | Ist | erfüllt |',
  '| --- | --- | ---: | :---: |',
  `| Katalog Kapitel 1 (Ereignisse in content/events/k1-*.yaml) | −25 % (von ${KATALOG_VORHER} auf ≤ 92) | ${k1.length} (${prozent(k1.length / KATALOG_VORHER - 1)}), davon ${k1Briefe.length} Briefe und ${k1.filter((e) => e.routine).length} feste Termine | ${k1.length <= 92 ? 'ja' : 'nein'} |`,
  `| Ab Runde 6: Briefe, die an Merkzeichen aus Jacobs Plänen hängen (alle Karten) | ≥ 50 % | ${prozent(anteil(a.spaetPostGekoppelt, a.spaetPost))} (${a.spaetPostGekoppelt} von ${a.spaetPost}); alles auf dem Tisch ${prozent(anteil(a.spaetTischGekoppelt, a.spaetTisch))} | ${anteil(a.spaetPostGekoppelt, a.spaetPost) >= 0.5 ? 'ja' : 'nein'} |`,
  `| Ø Briefe je Runde (alle Karten) | ≤ 1,2 | ${zahl(a.post / a.runden)}; alles auf dem Tisch ${zahl(a.tisch / a.runden)} | ${a.post / a.runden <= 1.2 ? 'ja' : 'nein'} |`,
  `| Höchstens ein Thorne-Brief je Runde | 1 | höchstens ${Math.max(a.thorneMax, v.thorneMax)} | ${Math.max(a.thorneMax, v.thorneMax) <= 1 ? 'ja' : 'nein'} |`,
].join('\n');
const varianten = [
  '| Variante (Standard-Bot) | Ø Briefe je Runde | Ø alles auf dem Tisch je Runde | ab Runde 6: Briefe an Plänen | ab Runde 6: alles an Plänen |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...(Object.entries(ergebnis) as [string, Zaehlung][]).map(
    ([name, z]) =>
      `| ${name === 'alleKarten' ? 'alle Karten' : name} | ${zahl(z.post / z.runden)} | ${zahl(z.tisch / z.runden)} | ${prozent(anteil(z.spaetPostGekoppelt, z.spaetPost))} | ${prozent(anteil(z.spaetTischGekoppelt, z.spaetTisch))} |`,
  ),
].join('\n');
const haeufigste = [...a.haeufig.entries()]
  .sort((x, y) => y[1] - x[1])
  .slice(0, 15)
  .map(([id, n]) => `${id}${gekoppelt.has(id) ? ' (Plan)' : ''} ${zahl(n / seeds)}`)
  .join(' · ');
const sekunden = ((Date.now() - start) / 1000).toFixed(1);

console.log(tabelle);
console.log(`\n${varianten}`);
console.log(`\nHäufigste Ereignisse je Partie (alle Karten): ${haeufigste}`);
console.log(`\nGekoppelt (${gekoppelt.size}): ${[...gekoppelt].join(', ')}`);
console.log(`\n${seeds} Seeds × 2 Varianten in ${sekunden} s.`);

if (schreiben) {
  const datei = new URL('docs/plan-termine-messung.md', root);
  const alt = readFileSync(datei, 'utf8');
  const MARKE = '<!-- Messung Etappe 3: npx tsx tools/termineMessung3.ts 500 --schreiben ersetzt bis zur nächsten Marke. -->';
  const ENDE = '<!-- Ende der Messung Etappe 3 -->';
  const block = `${MARKE}\n\nStand: ${new Date().toISOString().slice(0, 10)} · Version ${version} · ${seeds} Seeds (\`${balance.bots.seedPrefix}-0\` bis \`${balance.bots.seedPrefix}-${seeds - 1}\`), Standard-Bot mit allen ${catalog.length} Ereignissen, je Seed zwei Varianten der Karten\n\n${tabelle}\n\n${varianten}\n\nHäufigste Ereignisse je Partie (alle Karten): ${haeufigste}\n\n${ENDE}`;
  const neu = alt.includes(MARKE) && alt.includes(ENDE) ? alt.slice(0, alt.indexOf(MARKE)) + block + alt.slice(alt.indexOf(ENDE) + ENDE.length) : `${alt}\n${block}\n`;
  writeFileSync(datei, neu);
  console.log('Geschrieben: docs/plan-termine-messung.md');
}
