// Bohr-Trefferquote im echten Spielablauf: spielt je Variante viele Seeds wie ein
// Spieler (übers Land reiten, beste Prognose pachten, bohren, Runden mit Ereignissen, bergen, tiefer
// bohren, auf Wunsch speichern und laden) und vergleicht mit der Theorie.
// Aufruf: npx tsx tools/bohrquote.ts [Seeds, Standard 500]
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents } from '../src/sim/testEvents';
import { playDrillRun, type DrillRecord } from '../src/sim/testDrillRun';

const balance = loadBalance();
const catalog = loadEvents();
const n = Number(process.argv[2] ?? 500);
const stufe1 = balance.drilling.stages[0].oilShare;
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

function zeile(name: string, recs: DrillRecord[]): string {
  const gut = recs.filter((r) => r.shown >= 60);
  const m = (f: (r: DrillRecord) => number) => gut.reduce((s, r) => s + f(r), 0) / gut.length;
  // Etappe 1: Die Prognose rechnet mit den Hinweisen, die am echten Ausgang hängen – ihre Mitte ist die
  // Theorie (nicht mehr das verdeckte q, das vor dem Würfeln der Geologie galt).
  const chance = m((r) => r.shown / 100);
  return [
    name.padEnd(50),
    `Ranches ${String(gut.length).padStart(4)}`,
    `Öl darunter ${pct(m((r) => (r.dry ? 0 : 1)))} (Prognose ${pct(chance)}, q ${pct(m((r) => r.chance))})`,
    `Stufe 1 ${pct(m((r) => (r.foundStage === 1 ? 1 : 0)))} (Theorie ${pct(chance * stufe1)})`,
    `überhaupt gefunden ${pct(m((r) => (r.foundStage > 0 ? 1 : 0)))}`,
  ].join(' | ');
}

const varianten = [
  { name: 'ohne Ereignisse', opts: {} },
  { name: 'mit Ereignissen', opts: { catalog } },
  { name: 'ohne Ereignisse, Speichern/Laden', opts: { saveLoad: true } },
  { name: 'mit Ereignissen, Speichern/Laden', opts: { catalog, saveLoad: true } },
  { name: 'mit Ereignissen, nie tiefer', opts: { catalog, deeper: false } },
];
console.log(`${n} Seeds je Variante, nur angebohrte Ranches mit Prognose-Mitte ≥ 60 %:`);
for (const v of varianten) {
  const alle: DrillRecord[] = [];
  const erste: DrillRecord[] = [];
  for (let i = 0; i < n; i++) {
    const { records } = playDrillRun(`quote-${i}`, balance, v.opts);
    alle.push(...records);
    if (records[0]) erste.push(records[0]);
  }
  console.log(zeile(`${v.name} (erste Bohrung)`, erste));
  console.log(zeile(`${v.name} (alle)`, alle));
}
