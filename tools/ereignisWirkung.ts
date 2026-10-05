// Wirkung der Ereignis-Antworten (0.2.15+3): listet alle Antworten aus content/events/
// mit ihrem Wert und markiert schwache (zu wenig Wirkung, Merkzeichen ohne Folge).
// Regeln: src/sim/eventRelevance.ts, Schwellen: balance.yaml unter events.relevance.
// Aufruf: npm run check:events          – nur die schwachen, Fehlercode 1, wenn es welche gibt
//         npm run check:events -- --alle – alle Antworten
import { analyzeRelevance, formatRelevance } from '../src/sim/eventRelevance';
import { loadBalance } from '../src/sim/testBalance';
import { loadEvents, loadLaterMarks, loadReadMarks } from '../src/sim/testEvents';

const alle = process.argv.includes('--alle');
const balance = loadBalance();
const events = loadEvents();
const report = analyzeRelevance(events, loadReadMarks(events, balance), balance, loadLaterMarks());

const r = balance.events.relevance;
console.log(
  `Schwelle: Kapitel 1 ${report.threshold} $ (${r.minShare * 100} % von ${r.chapterMoney} $; Geld, Kraft und Familie × ${r.letterScale}), spätere Kapitel ${report.laterThreshold} $ (von ${r.laterChapterMoney} $).`,
);
if (alle) {
  let letztes = '';
  for (const c of report.choices) {
    if (c.event !== letztes) console.log(`\n${c.event}`);
    letztes = c.event;
    console.log(`  ${formatRelevance(c)}`);
  }
  console.log('');
}
const zahl = (v: string) => report.choices.filter((c) => c.verdict === v).length;
console.log(
  `${report.choices.length} Antworten: ${zahl('stark')} stark, ${zahl('gegenstueck')} Gegenstück, ${zahl('termin')} feste Termine, ${report.weak.length} schwach.`,
);
if (report.weak.length > 0) {
  console.log('\nSchwache Antworten:');
  for (const c of report.weak) console.log(`  ${formatRelevance(c)}`);
  process.exit(1);
}
