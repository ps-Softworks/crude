import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { agendaView, appointmentsLeft, settleAgenda, sickRoundsFor, spendAppointments, strengthLevel, strengthWord, timeReason } from './agenda';
import { BalanceError, parseBalance } from './balance';
import { checksLeft } from './documents';
import { applyEffects, autoResolve, deskEvents, resolveEvent } from './events';
import {
  applyFamilyEffects,
  bondWord,
  checkBirth,
  familyStrength,
  familyView,
  parseFamilyContent,
  settleFamily,
  thomasBorn,
} from './family';
import { endRound, newGame, type GameState } from './game';
import { deserializeGame, serializeGame, SAVE_FORMAT } from './save';
import { loadBalance, rawBalance } from './testBalance';
import { loadEvents } from './testEvents';

const balance = loadBalance();
const katalog = loadEvents();
const familyText = readFileSync(new URL('../../content/family.yaml', import.meta.url), 'utf8');
const content = parseFamilyContent('content/family.yaml', familyText).content!;

/** Runden beenden, bis die gewünschte Runde läuft. */
function bisRunde(state: GameState, runde: number, catalog = katalog): GameState {
  let s = state;
  while (s.round < runde) s = endRound(s, balance, catalog);
  return s;
}

/** Ein Ereignis auf den Schreibtisch legen, Frist diese Runde. */
function aufDenTisch(state: GameState, id: string): GameState {
  return { ...state, events: { ...state.events, pending: [...state.events.pending, id], due: { ...state.events.due, [id]: state.round } } };
}

describe('Familie: Ruth (2.7)', () => {
  it('zu Spielbeginn ist Ruth zufrieden und Thomas noch nicht geboren', () => {
    const s = newGame('start', balance);
    expect(s.family.ruth).toBe(balance.family.ruthStart);
    expect(thomasBorn(s)).toBe(false);
    expect(bondWord(s.family.ruth, balance)).toBe('content');
  });

  it('Zustandswörter nach den Schwellen aus balance.yaml', () => {
    const f = balance.family;
    expect(bondWord(f.contentFrom, balance)).toBe('content');
    expect(bondWord(f.contentFrom - 1, balance)).toBe('neglected');
    expect(bondWord(f.neglectedFrom - 1, balance)).toBe('bitter');
    expect(bondWord(f.bitterFrom - 1, balance)).toBe('estranged');
  });

  it('Effekte ruth/thomas: Beziehung bleibt zwischen 0 und 100, Thomas zählt erst ab der Geburt', () => {
    const s = newGame('effekte', balance);
    expect(applyEffects(s, { ruth: 500 }).family.ruth).toBe(100);
    expect(applyEffects(s, { ruth: -500 }).family.ruth).toBe(0);
    expect(applyEffects(s, { thomas: 20 }).family.thomas).toBe(0);
    const geboren = { ...s, family: { ...s.family, thomasBorn: 1, thomas: 50 } };
    expect(applyEffects(geboren, { thomas: 20 }).family.thomas).toBe(70);
  });

  it('nur was der Familie guttut, zählt als Familienzeit', () => {
    const s = newGame('zeit', balance);
    expect(applyFamilyEffects(s, 5, undefined).family.time).toBe(1);
    expect(applyFamilyEffects(s, -5, undefined).family.time).toBe(0);
    expect(applyFamilyEffects(s, undefined, 5).family.time).toBe(0); // Thomas noch nicht geboren
    expect(applyFamilyEffects(s, undefined, undefined)).toBe(s);
  });

  it('eine Runde ohne Familienzeit kostet Beziehung, ein Wortwechsel steht im Protokoll', () => {
    const s = { ...newGame('vernachlaessigt', balance), family: { ruth: balance.family.contentFrom, thomas: 0, thomasBorn: 0, time: 0 } };
    const nach = settleFamily(s, balance);
    expect(nach.family.ruth).toBe(balance.family.contentFrom - balance.family.neglect);
    expect(nach.log.at(-1)).toContain('Ruth wirkt jetzt vernachlässigt');
    expect(nach.strength).toBe(s.strength);
  });

  it('liegt Jacob krank zu Hause, leidet die Familie nicht', () => {
    const s = { ...newGame('krank', balance), sick: 2 };
    expect(settleFamily(s, balance).family.ruth).toBe(s.family.ruth);
  });

  it('Familienzeit gibt am Rundenende Kraft: +3 bei kaputter, +8 bei bester Beziehung (GDD §4)', () => {
    const s = { ...newGame('kraft', balance), strength: 50 };
    const gut = { ...s, family: { ...s.family, ruth: 100, time: 1 } };
    const schlecht = { ...s, family: { ...s.family, ruth: 0, time: 1 } };
    expect(familyStrength(gut, balance)).toBe(balance.family.strengthTo);
    expect(familyStrength(schlecht, balance)).toBe(balance.family.strengthFrom);
    const nach = settleFamily(gut, balance);
    expect(nach.strength).toBe(50 + balance.family.strengthTo);
    expect(nach.family.time).toBe(0);
    expect(nach.family.ruth).toBe(100);
    expect(nach.log.at(-1)).toContain('Familie gibt Jacob Kraft');
  });

  it('ein Abend mit Ruth (fester Termin) ist Familienzeit und gibt am Rundenende Kraft', () => {
    const s = { ...newGame('abend', balance, katalog), strength: 60 };
    const r = resolveEvent(s, balance, katalog, 'termin_ruth', 'bleiben');
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.family.time).toBe(1);
    expect(r.state.strength).toBe(60);
    const plus = familyStrength(r.state, balance);
    // + ruhige Runde (keine Überstunden)
    expect(endRound(r.state, balance, katalog).strength).toBe(60 + plus + balance.agenda.restBonus);
  });
});

describe('Familie: Geburt von Thomas (2.7)', () => {
  it('Thomas kommt zu Beginn der Runde thomasBirthRound zur Welt – mit Merkzeichen und Protokoll', () => {
    const vorher = bisRunde(newGame('geburt', balance), balance.family.thomasBirthRound - 1);
    expect(thomasBorn(vorher)).toBe(false);
    const s = endRound(vorher, balance);
    expect(s.round).toBe(balance.family.thomasBirthRound);
    expect(s.family.thomasBorn).toBe(s.round);
    expect(s.family.thomas).toBe(balance.family.thomasStart);
    expect(s.events.marks.thomas_geboren).toBe(s.round);
    expect(s.log).toContain(`${s.log.find((l) => l.includes('Thomas Harlan kommt zur Welt'))}`);
    // Nur einmal.
    expect(checkBirth(s, balance)).toBe(s);
  });

  it('mit den echten Inhalten liegt die Geburt sicher auf dem Schreibtisch', () => {
    for (const seed of ['a', 'b', 'c']) {
      const s = bisRunde(newGame(seed, balance, katalog), balance.family.thomasBirthRound);
      expect(s.events.pending).toContain('thomas_geburt');
    }
  });

  it('dabei sein kostet 2 Termine und stärkt die Familie; verpassen ist die Standardantwort und kränkt Ruth', () => {
    const s = bisRunde(newGame('wehen', balance, katalog), balance.family.thomasBirthRound);
    const dabei = resolveEvent(s, balance, katalog, 'thomas_geburt', 'dabei');
    if (!dabei.ok) throw new Error(dabei.reason);
    expect(dabei.state.agenda.used).toBe(2);
    expect(dabei.state.family.ruth).toBeGreaterThan(s.family.ruth);
    expect(dabei.state.events.marks.geburt_dabei).toBe(s.round);

    const verpasst = autoResolve(s, katalog);
    expect(verpasst.family.ruth).toBe(s.family.ruth - 20);
    expect(verpasst.events.marks.geburt_verpasst).toBe(s.round);
  });

  it('nach der Geburt wird aus dem Abend mit Ruth ein Abend zu dritt', () => {
    const s = bisRunde(newGame('zu-dritt', balance, katalog), balance.family.thomasBirthRound);
    const r = resolveEvent(s, balance, katalog, 'termin_familie', 'bleiben');
    expect(r.ok).toBe(true);
    expect(resolveEvent(s, balance, katalog, 'termin_ruth', 'bleiben').ok).toBe(false);
  });
});

describe('Kraft-Schwellen (2.7, GDD §4)', () => {
  const a = balance.agenda;

  it('unter errorsBelow fehlen die besten Antworten (sharp)', () => {
    const basis = aufDenTisch({ ...newGame('fehler', balance, katalog), cash: 5000 }, 'post_witwe');
    const frisch = deskEvents(basis, balance, katalog).find((e) => e.id === 'post_witwe')!;
    expect(frisch.choices.find((c) => c.id === 'verhandeln')!.ok).toBe(true);
    const muede = { ...basis, strength: a.errorsBelow - 1 };
    const gesperrt = deskEvents(muede, balance, katalog).find((e) => e.id === 'post_witwe')!.choices.find((c) => c.id === 'verhandeln')!;
    expect(gesperrt).toMatchObject({ ok: false, reason: 'Jacob ist zu erschöpft – diese Antwort fällt ihm gerade nicht ein.' });
    const r = resolveEvent(muede, balance, katalog, 'post_witwe', 'verhandeln');
    expect(r.ok).toBe(false);
    // Die anderen Antworten gehen weiter.
    expect(resolveEvent(muede, balance, katalog, 'post_witwe', 'zahlen').ok).toBe(true);
  });

  it('unter errorsBelow prüft die Lupe weniger Felder', () => {
    const s = newGame('lupe', balance);
    expect(checksLeft(s, balance, 'x')).toBe(balance.events.documents.maxChecks);
    expect(checksLeft({ ...s, strength: a.errorsBelow - 1 }, balance, 'x')).toBe(balance.events.documents.maxChecks - a.errorsCheckPenalty);
  });

  it('wie lange Jacob krank wird: je tiefer die Kraft, desto länger; bei 0 Zusammenbruch', () => {
    expect(sickRoundsFor(a.sickBelow, balance)).toBe(0);
    expect(sickRoundsFor(a.sickBelow - 1, balance)).toBe(1);
    expect(sickRoundsFor(1, balance)).toBe(a.sickRoundsMax);
    expect(sickRoundsFor(0, balance)).toBe(a.collapseRounds);
    for (let k = 1; k < a.sickBelow; k++) {
      expect(sickRoundsFor(k, balance)).toBeGreaterThanOrEqual(sickRoundsFor(k + 1, balance));
    }
  });

  it('unter sickBelow am Rundenende wird Jacob krank: keine Termine, keine Überstunden', () => {
    const s = settleAgenda({ ...newGame('fieber', balance, katalog), strength: a.sickBelow - 1 }, balance);
    expect(s.sick).toBe(1);
    expect(s.log.at(-1)).toContain('Jacob ist krank');
    expect(appointmentsLeft(s, balance)).toBe(0);
    expect(timeReason(s, balance, 1)).toContain('krank im Bett');
    expect(timeReason(s, balance, 0)).toBeNull();
    expect(resolveEvent(s, balance, katalog, 'termin_sonntag', 'ausspannen').ok).toBe(false);
    expect(agendaView(s, balance)).toMatchObject({ sickRounds: 1, left: 0, word: 'krank' });
  });

  it('im Krankenbett kommt Jacob wieder zu Kräften und steht danach auf', () => {
    const krank = { ...newGame('bett', balance), strength: 10, sick: 1 };
    const s = settleAgenda(krank, balance);
    expect(s.sick).toBe(0);
    expect(s.strength).toBe(10 + a.sickRecovery + a.restBonus);
    expect(s.log).toContain(s.log.find((l) => l.includes('wieder auf den Beinen')));
    expect(s.agenda.budget).toBeGreaterThan(0);
  });

  it('bei 0 bricht Jacob zusammen und fällt collapseRounds Runden aus', () => {
    let s: GameState = { ...newGame('zusammenbruch', balance), strength: 0 };
    s = endRound(s, balance);
    expect(s.sick).toBe(a.collapseRounds);
    expect(s.log.some((l) => l.includes('Zusammenbruch'))).toBe(true);
    let runden = 0;
    while (s.sick > 0 && !s.finished) {
      s = endRound(s, balance);
      runden++;
    }
    expect(runden).toBe(a.collapseRounds);
    expect(s.strength).toBeGreaterThanOrEqual(a.sickBelow);
  });

  it('krank bleiben Ereignisse liegen und bekommen ihre Standardantwort', () => {
    const s = bisRunde(newGame('krank-geburt', balance, katalog), balance.family.thomasBirthRound);
    const krank = { ...s, sick: 1 };
    expect(resolveEvent(krank, balance, katalog, 'thomas_geburt', 'dabei').ok).toBe(false);
    const weiter = endRound(krank, balance, katalog);
    expect(weiter.events.marks.geburt_verpasst).toBe(s.round);
  });
});

describe('Fertig-Kriterium 2.7: niedrige Kraft hat sichtbare Folgen', () => {
  it('Wort in der Kopfzeile, Satz im Familienbildschirm und Hinweise ändern sich mit der Kraft – nie die Zahl', () => {
    const s = newGame('sichtbar', balance);
    const stufen = [100, a().tiredBelow - 1, a().errorsBelow - 1].map((strength) => ({ ...s, strength }));
    const woerter = stufen.map((x) => strengthWord(x, balance));
    expect(woerter).toEqual(['ausgeruht', 'müde', 'erschöpft']);
    const saetze = new Set([...stufen, { ...s, sick: 1 }].map((x) => familyView(x, balance, content).jacob));
    expect(saetze.size).toBe(4);
    expect(familyView({ ...s, strength: a().errorsBelow - 1 }, balance, content).jacob).toContain('zittrig');
    // Die Termine der Runde stehen am Rundenanfang fest – darum über settleAgenda.
    const muede = settleAgenda({ ...s, strength: a().tiredBelow - 1 - a().restBonus, agenda: { ...s.agenda, used: s.agenda.budget + 1 } }, balance);
    expect(agendaView(muede, balance)).toMatchObject({ tired: true, exhausted: false });
    expect(agendaView(stufen[2], balance).exhausted).toBe(true);
    for (const x of stufen) expect(familyView(x, balance, content).jacob).not.toMatch(/\d/);
  });

  it('wer jede Runde Überstunden macht, wird müde, erschöpft und schließlich krank', () => {
    let s = newGame('raubbau', balance, katalog);
    const gesehen = new Set<string>();
    for (let i = 0; i < 15 && !s.finished; i++) {
      // Alle Termine und beide Überstunden belegen (ohne Familie und Erholung).
      const r = spendAppointments(s, balance, appointmentsLeft(s, balance));
      if (r.ok) s = r.state;
      gesehen.add(strengthLevel(s, balance));
      s = endRound(s, balance, katalog);
    }
    expect(gesehen).toContain('tired');
    expect(gesehen).toContain('exhausted');
    expect(gesehen).toContain('sick');
  });

  function a() {
    return balance.agenda;
  }
});

describe('Familientexte (content/family.yaml)', () => {
  it('die echte Datei ist vollständig', () => {
    expect(parseFamilyContent('content/family.yaml', familyText).errors).toEqual([]);
  });

  it('fehlende Einträge und Sprachen werden gemeldet', () => {
    const roh = parse(familyText) as Record<string, Record<string, unknown>>;
    delete roh.thomas.bitter;
    roh.jacob.rested = { en: 'only english' };
    const text = JSON.stringify(roh);
    const { content: c, errors } = parseFamilyContent('f.yaml', text);
    expect(c).toBeNull();
    expect(errors.map((e) => e.message)).toEqual(['thomas.bitter: braucht Sprachschlüssel de/en.', 'jacob.rested: deutscher Text fehlt.']);
  });

  it('Familienbildschirm: Ruth immer, Thomas erst nach der Geburt', () => {
    const s = newGame('bildschirm', balance);
    expect(familyView(s, balance, content).members.map((m) => m.id)).toEqual(['ruth']);
    const geboren = { ...s, family: { ...s.family, thomasBorn: 3, thomas: 10 } };
    const v = familyView(geboren, balance, content);
    expect(v.members.map((m) => [m.id, m.wordText])).toEqual([
      ['ruth', 'zufrieden'],
      ['thomas', 'entfremdet'],
    ]);
  });
});

describe('Balance und Spielstand (2.7)', () => {
  const roh = () => rawBalance() as any;

  it('Kraft-Schwellen müssen aufsteigen, Familien-Schwellen auch', () => {
    const r1 = roh();
    r1.agenda.sickBelow = 40;
    expect(() => parseBalance(r1)).toThrow(BalanceError);
    const r2 = roh();
    r2.family.bitterFrom = 90;
    expect(() => parseBalance(r2)).toThrow(BalanceError);
    const r3 = roh();
    delete r3.family;
    expect(() => parseBalance(r3)).toThrow('Block "family" fehlt');
  });

  it('Familie und Krankheit überstehen Sichern und Laden', () => {
    const s = { ...bisRunde(newGame('sichern', balance), balance.family.thomasBirthRound), sick: 2 };
    const geladen = deserializeGame(serializeGame(s, '0.2.7'));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.family).toEqual(s.family);
    expect(geladen.state.sick).toBe(2);
  });

  it('Spielstände aus Format 5 bekommen Ersatzwerte: gesund, Ruth zufrieden, Thomas kommt noch', () => {
    const { family: _f, sick: _s, ...alt } = newGame('alt', balance);
    const geladen = deserializeGame(JSON.stringify({ format: SAVE_FORMAT, appVersion: '0.2.6', savedRound: 1, state: alt }));
    if (!geladen.ok) throw new Error(geladen.reason);
    expect(geladen.state.sick).toBe(0);
    expect(geladen.state.family).toEqual({ ruth: 70, thomas: 0, thomasBorn: 0, time: 0 });
    expect(bondWord(geladen.state.family.ruth, balance)).toBe('content');
  });

  it('ein Spielstand ohne Familie im neuen Format ist unvollständig', () => {
    const { family: _f, ...ohne } = newGame('ohne', balance);
    const geladen = deserializeGame(JSON.stringify({ format: 6, appVersion: '0.2.7', savedRound: 1, state: { ...ohne, family: 'x' } }));
    expect(geladen.ok).toBe(false);
  });
});
