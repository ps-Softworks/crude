// 4.19 Kapitel 3 „Der Konzernherr“ spielbar (GDD §13/§14): Kapitelprüfung (Marke in ≥ 3 Regionen oder
// ≥ 10 % Marktanteil, am Ende mindestens Rating C), Story-Bögen, Rivalen K3, Systemwirkungen der
// Kapitel-3-Ereignisse und ein ganzer Durchlauf Kapitel 1 → 3 mit Bots.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nonFiniteNumbers } from './testFinite';
import { arcSummaries, parseArcContent } from './arcs';
import { brandOf, buildingCount, buildStations, foundBrand, brandWorldFrom } from './brand';
import { botTurn } from './bots';
import { botChapterSystems, DEFAULT_BRAND_BOT } from './botsKapitel3';
import { applyEarlyEnding, canGoPublic, chapter3Check, chapterPassed, chapterResult, decideIpo, parseChapterContent } from './chapter';
import { openChapterSystems } from './chapterSystems';
import { applySystemEffects, checkSystemEffects, parseSystemEffects, systemImpact, type SystemEffects } from './eventSystems';
import { endRound, newGame, type GameState } from './game';
import { hallsteadOf } from './hallsteadState';
import { syncKonsortiumMarks, KONSORTIUM_MARKS } from './kapitel3Runde';
import { Rng, seedFromString } from './rng';
import { RIVALS_K3_MARKS, settleRivalsK3, startRivalsK3, validRivalsK3 } from './rivalsK3';
import { deserializeGame, SAVE_FORMAT, serializeGame } from './save';
import { parseStocksContent } from './stocksContent';
import { loadBalance } from './testBalance';
import { loadEvents } from './testEvents';
import { chapterEnds } from './timeskipBots';
import { answerSwitch, runTimeskip, startTimeskip, SWITCH_CHOICES, timeskipBlocked } from './timeskip';

const balance = loadBalance();
const catalog = loadEvents();
const jedesKapitel = new Set(catalog.filter((e) => e.conditions.minChapter === 1 && e.conditions.maxChapter === undefined).map((e) => e.id));
const board = parseStocksContent('content/stocks.yaml', readFileSync(new URL('../../content/stocks.yaml', import.meta.url), 'utf8'), balance.stocks.board.seatsMax).content!.board;
const TEXTE = { stocksBoard: board };
const arcs = parseArcContent('content/arcs.yaml', readFileSync(new URL('../../content/arcs.yaml', import.meta.url), 'utf8')).content!;

/** Kapitel 3 mit allen Systemen (Aktiengesellschaft, 30 % verkauft). */
function k3(seed = 'kapitel3', extra: Partial<GameState> = {}): GameState {
  const s: GameState = { ...newGame(seed, balance, catalog), chapter: 3, chapterStart: 1, ipo: { share: 0.3, proceeds: 0 }, cash: 200000, ...extra };
  return startRivalsK3(openChapterSystems(s, balance, TEXTE), balance);
}

/** Marke gegründet, in n Regionen mit Tankstellen und genau presenceShare Marktanteil in der letzten Abrechnung (0.4.20+6). */
function mitMarke(s0: GameState, regionen: string[]): GameState {
  const welt = brandWorldFrom(s0);
  const r = foundBrand(s0, balance, welt, 'harlan');
  if (!r.ok) throw new Error(r.reason);
  const brand = brandOf(r.state, balance);
  const p = balance.brand.goal.presenceShare;
  // Alle anderen Regionen mit Nachfrage, aber ohne Absatz – sonst zählte der landesweite Anteil nur die genannten.
  const regions = Object.fromEntries(
    Object.entries(brand.regions).map(([id, r]) => [id, { ...r, last: { demand: 1000, sales: 0, craneSales: 0, share: 0, craneShare: 0, profit: 0, priceWar: false } }]),
  );
  for (const id of regionen) regions[id] = { ...regions[id], stations: 6, last: { demand: 1000, sales: 1000 * p, craneSales: 0, share: p, craneShare: 0, profit: 0, priceWar: false } };
  return { ...r.state, brand: { ...brand, regions } };
}

function wirk(state: GameState, sys: SystemEffects): GameState {
  return applySystemEffects(state, sys, balance, 'test', 'Test');
}

function sys(raw: Record<string, unknown>): SystemEffects | null {
  return parseSystemEffects(raw, () => {});
}

describe('Kapitelprüfung Kapitel 3 (GDD §13)', () => {
  it('Marke in drei Regionen und Rating C: geschafft; Rating D: verfehlt', () => {
    const s = mitMarke(k3(), ['cordova', 'okara', 'mittelland']);
    expect(chapter3Check({ ...s, rating: 'C' }, balance)).toMatchObject({ regions: 3, regionsReached: true, brand: true, ratingReached: true, passed: true });
    expect(chapter3Check({ ...s, rating: 'B' }, balance).passed).toBe(true);
    expect(chapter3Check({ ...s, rating: 'D' }, balance)).toMatchObject({ ratingReached: false, passed: false });
  });

  it('zwei Regionen ohne genug Marktanteil reichen nicht; genug landesweiter Marktanteil reicht auch mit einer Region', () => {
    const zwei = mitMarke(k3(), ['cordova', 'okara']);
    expect(chapter3Check({ ...zwei, rating: 'B' }, balance).brand).toBe(false);
    const eine = mitMarke(k3(), ['cordova']);
    const brand = eine.brand!;
    // Landesweit = Absatz aller Regionen ÷ Nachfrage aller Regionen: Cordova mit großer Nachfrage, alles verkauft.
    const andere = 1000 * (Object.keys(brand.regions).length - 1);
    const viel = { demand: andere, sales: andere, craneSales: 0, share: 1, craneShare: 0, profit: 1, priceWar: false };
    expect(0.5).toBeGreaterThanOrEqual(balance.brand.goal.share);
    const mitAnteil: GameState = { ...eine, rating: 'B', brand: { ...brand, regions: { ...brand.regions, cordova: { ...brand.regions.cordova, last: viel } } } };
    expect(chapter3Check(mitAnteil, balance)).toMatchObject({ shareReached: true, passed: true });
  });

  it('ohne Marke verfehlt; chapterPassed und chapterResult lesen die Prüfung von Kapitel 3', () => {
    const ohne = { ...k3(), rating: 'B' as const };
    expect(chapter3Check(ohne, balance).passed).toBe(false);
    expect(chapterPassed(ohne, balance)).toBe(false);
    const geschafft = { ...mitMarke(k3(), ['cordova', 'okara', 'mittelland']), rating: 'C' as const, finished: true, ending: 'kapitel' as const };
    expect(chapterResult(geschafft, balance)).toBe('erreicht');
  });

  it('am Kapitelende: Prüfung im Protokoll, kein Börsengang, kein weiterer Zeitsprung (Kapitel 4 folgt)', () => {
    const s = { ...mitMarke(k3(), ['cordova', 'okara', 'mittelland']), round: 16, totalRounds: 16 };
    const ende = endRound(s, balance, catalog);
    expect(ende.finished).toBe(true);
    if (ende.ending === 'kapitel') {
      expect(ende.log.at(-1)).toMatch(/Kapitel 3 ist zu Ende/);
      expect(canGoPublic(ende, balance)).toBe(false);
      expect(timeskipBlocked(ende, balance)).toMatch(/Kapitel 4/);
    }
  });

  it('die frühen Enden gelten auch in Kapitel 3', () => {
    const s = k3();
    const abgesetzt = applyEarlyEnding({ ...s, stocks: { ...s.stocks!, ousted: s.round } }, balance);
    expect(abgesetzt.ending).toBe('abgesetzt');
  });

  it('Texte für alle Ausgänge, die Prüfung und das Ende des Early-Access-Umfangs stehen in content/chapter.yaml', () => {
    const c = parseChapterContent('content/chapter.yaml', readFileSync(new URL('../../content/chapter.yaml', import.meta.url), 'utf8'));
    expect(c.errors).toEqual([]);
    for (const id of ['erreicht', 'verfehlt', 'verkauft', 'abgesetzt', 'geschluckt', 'haft'] as const) expect(c.content!.chapter3.endings[id].title.de).not.toBe('');
    expect(c.content!.chapter3.next.title.de).toMatch(/Ende des Early-Access-Umfangs – Kapitel 4 folgt/);
    expect(c.content!.chapter2.next.text.de).not.toMatch(/im Bau/);
  });
});

describe('Was aus ihnen wurde (Kapitel 3)', () => {
  it('der Kapitelabschluss von Kapitel 3 zeigt Daniel, Thomas, Ruth und Mr. Vale', () => {
    const s = k3();
    expect(arcSummaries(s, arcs).map((b) => b.arc)).toEqual(['daniel_k3', 'thomas_k3', 'ruth_k3', 'vale_k3']);
    const marks = { daniel_verbuendet: 3, thomas_feld: 4, ehe_partner: 10, [KONSORTIUM_MARKS.mitglied]: 8 };
    const mit = arcSummaries({ ...s, events: { ...s.events, marks } }, arcs);
    expect(mit.map((b) => b.outcome)).toEqual(['verbuendet', 'feld', 'partner', 'mitglied']);
  });

  it('der Weg mit dem Konsortium wird zum Merkzeichen – einmal je Weg', () => {
    const s = k3();
    const k = s.kapitel3!;
    const mitglied = syncKonsortiumMarks({ ...s, kapitel3: { ...k, konsortium: { ...k.konsortium, path: 'mitglied' } } });
    expect(mitglied.events.marks[KONSORTIUM_MARKS.mitglied]).toBe(s.round);
    expect(syncKonsortiumMarks(mitglied)).toBe(mitglied);
    expect(syncKonsortiumMarks(s)).toBe(s);
  });
});

describe('Rivalen in Kapitel 3', () => {
  it('Kapitelstart: Bullard hat Schulden, Margarets Marke ist überall bekannter; vor Kapitel 3 passiert nichts', () => {
    const s = k3();
    expect(s.rivalsK3).toEqual({ bullardDebt: balance.rivalsK3.bullard.startDebt, thorneBought: 0, thorneBubble: 1, margaretBuilt: 0 });
    const ohne = openChapterSystems({ ...newGame('k3-ohne', balance, catalog), chapter: 3 }, balance, TEXTE);
    for (const [id, r] of Object.entries(s.brand!.regions)) expect(r.crane.awareness).toBeGreaterThan(ohne.brand!.regions[id].crane.awareness);
    const k2 = openChapterSystems({ ...newGame('k3-k2', balance, catalog), chapter: 2 }, balance, TEXTE);
    expect(startRivalsK3(k2, balance)).toBe(k2);
    expect(settleRivalsK3(k2, balance)).toBe(k2);
  });

  it('Margaret wirbt, wo Harlan Tankstellen hat, und baut alle paar Runden neben Harlans stärkster', () => {
    let s = mitMarke(k3(), ['cordova']);
    const vorher = s.brand!.regions.cordova.crane;
    const andere = s.brand!.regions.ostkueste.crane.awareness;
    for (let i = 0; i < balance.rivalsK3.margaret.buildEvery; i++) s = { ...settleRivalsK3(s, balance), round: s.round + 1 };
    expect(s.brand!.regions.cordova.crane.awareness).toBeGreaterThan(vorher.awareness);
    expect(s.brand!.regions.ostkueste.crane.awareness).toBe(andere);
    expect(s.brand!.regions.cordova.crane.stations).toBe(vorher.stations + 1);
    expect(s.rivalsK3!.margaretBuilt).toBe(1);
  });

  it('Thorne kauft in der Aktiengesellschaft über Strohmänner – mit Groll doppelt so viel – und bläht seine Golfbahn auf', () => {
    const s = k3();
    const eine = settleRivalsK3(s, balance);
    const gekauft = eine.rivalsK3!.thorneBought;
    expect(gekauft).toBeGreaterThan(0);
    expect(eine.stocks!.blocks.reduce((x, b) => x + b.shares, 0)).toBe(s.stocks!.blocks.reduce((x, b) => x + b.shares, 0) + gekauft);
    const grollend = { ...s, diplomacy: { ...s.diplomacy!, relations: { ...s.diplomacy!.relations, thorne: { trust: 0, grudge: 90 } } } };
    expect(settleRivalsK3(grollend, balance).rivalsK3!.thorneBought).toBeGreaterThanOrEqual(2 * gekauft - 1);
    const aktie = balance.rivalsK3.thorne.stock;
    expect(eine.exchange!.prices[aktie]).toBeGreaterThan(s.exchange!.prices[aktie]);
    // Im Börsencrash platzt die Blase.
    const crash = { ...eine, exchange: { ...eine.exchange!, events: ['crash' as const], crash: 2 } };
    const geplatzt = settleRivalsK3(crash, balance);
    expect(geplatzt.exchange!.prices[aktie]).toBeLessThan(eine.exchange!.prices[aktie]);
    expect(geplatzt.rivalsK3!.thorneBubble).toBe(1);
    // Familienfirma: kein Aktienkauf.
    const familie = k3('k3-familie', { ipo: { share: 0, proceeds: 0 } });
    expect(settleRivalsK3(familie, balance).rivalsK3!.thorneBought).toBe(0);
  });

  it('Bullard leiht, wenn die Kasse knapp ist, zahlt Zinsen – und ist ab distressAt am Ende (Merkzeichen)', () => {
    const b = balance.rivalsK3.bullard;
    const s = k3();
    const knapp = settleRivalsK3({ ...s, rival: { ...s.rival, cash: 0 } }, balance);
    expect(knapp.rivalsK3!.bullardDebt).toBeGreaterThan(b.startDebt);
    const reich = settleRivalsK3({ ...s, rival: { ...s.rival, cash: 1_000_000 } }, balance);
    expect(reich.rivalsK3!.bullardDebt).toBe(b.startDebt);
    expect(reich.rival.cash).toBeLessThan(1_000_000);
    const amEnde = settleRivalsK3({ ...s, rival: { ...s.rival, cash: 0 }, rivalsK3: { ...s.rivalsK3!, bullardDebt: b.distressAt } }, balance);
    expect(amEnde.events.marks[RIVALS_K3_MARKS.bullardBroke]).toBe(s.round);
    expect(amEnde.diplomacy!.relations.bullard.trust).toBeGreaterThan(s.diplomacy!.relations.bullard.trust);
  });

  it('der Zustand übersteht Speichern und Laden; kaputte Werte werden abgelehnt', () => {
    const s = settleRivalsK3(k3(), balance);
    const r = deserializeGame(serializeGame(s, '0.4.19'));
    expect(r.ok).toBe(true);
    expect(validRivalsK3({ bullardDebt: 'viel' })).toBe(false);
    expect(validRivalsK3(undefined)).toBe(true);
    expect(SAVE_FORMAT).toBe(26);
    // Format 20 (0.4.12) lädt weiter.
    const alt = deserializeGame(JSON.stringify({ format: 20, appVersion: '0.4.12', savedRound: s.round, state: { ...s, rivalsK3: undefined } }));
    expect(alt.ok).toBe(true);
  });
});

describe('Systemwirkungen der Kapitel-3-Ereignisse', () => {
  it('Marke: Bekanntheit je Region oder überall, Tankstellen sofort; ohne gegründete Marke verpufft beides', () => {
    const ohne = k3();
    expect(wirk(ohne, { brand: { cordova: 10 }, stations: { cordova: 2 } }).brand).toEqual(ohne.brand);
    const s = mitMarke(k3(), ['cordova']);
    const a = wirk(s, { brand: { cordova: 10, okara: -5 }, stations: { okara: 2 } });
    expect(a.brand!.regions.cordova.awareness).toBe(s.brand!.regions.cordova.awareness + 10);
    expect(a.brand!.regions.okara.awareness).toBe(0);
    expect(a.brand!.regions.okara.stations).toBe(2);
    const alle = wirk(s, { brand: { alle: 4 } });
    expect(alle.brand!.regions.cordova.awareness).toBe(s.brand!.regions.cordova.awareness + 4);
    expect(alle.brand!.regions.ostkueste.awareness).toBe(s.brand!.regions.ostkueste.awareness);
    expect(sys({ brand: 5 })).toEqual({ brand: { alle: 5 } });
  });

  it('Stand, Lobby, Konsortium und Seismik', () => {
    const s = k3();
    const k = s.kapitel3!;
    const a = wirk(s, { ansehen: 2, favors: 3, consortium: { trust: 10, power: -5 }, seismik: 1 });
    expect(a.kapitel3!.stand.ansehen).toBe(k.stand.ansehen + 2 * balance.eventSystems.ansehenStep);
    expect(hallsteadOf(a, balance).lobby.favors).toBe(3);
    expect(a.kapitel3!.konsortium.trust).toBe(Math.min(100, k.konsortium.trust + 10));
    expect(a.kapitel3!.konsortium.power).toBe(k.konsortium.power - 5);
    expect(a.kapitel3!.seismik.license).toBe(true);
    const zwei = wirk(a, { seismik: 1 });
    expect(zwei.kapitel3!.seismik.crews).toBe(Math.min(balance.kapitel3.seismik.maxCrews, a.kapitel3!.seismik.crews + 1));
    expect(wirk(zwei, { seismik: -1 }).kapitel3!.seismik.crews).toBe(zwei.kapitel3!.seismik.crews - 1);
    expect(wirk(a, { favors: -10 }).hallstead!.lobby.favors).toBe(0);
  });

  it('Börse: Kauf (auch auf Kredit), Verkauf nach Kurswert, Börsenfieber', () => {
    const s = k3();
    const kauf = wirk(s, { stock: { motorwagen: 1000 }, leverage: 10 });
    const p = kauf.exchange!.positions.at(-1)!;
    expect(p).toMatchObject({ stock: 'motorwagen', stake: 1000, loan: 9000 });
    expect(kauf.cash).toBe(s.cash);
    const wert = p.shares * kauf.exchange!.prices.motorwagen;
    const halb = wirk(kauf, { stock: { motorwagen: -wert / 2 } });
    expect(halb.exchange!.positions.at(-1)!.shares).toBeCloseTo(p.shares / 2);
    expect(wirk(kauf, { stock: { motorwagen: -wert * 2 } }).exchange!.positions).toHaveLength(0);
    expect(wirk(s, { fever: 10 }).exchange!.fever).toBeCloseTo(Math.min(100, s.exchange!.fever + 10), 0);
  });

  it('Parteien: Anteil steigt, die Summe bleibt 1', () => {
    const s = k3();
    const a = wirk(s, { party: { handel: 5 } });
    expect(a.worldModel.parties.handel).toBeCloseTo(s.worldModel.parties.handel + 5 * balance.eventSystems.partyStep);
    expect(Object.values(a.worldModel.parties).reduce((x, y) => x + y, 0)).toBeCloseTo(1);
  });

  it('Lesen und Prüfen: falsche Werte, unbekannte Regionen und Aktien werden gemeldet; alles zählt für die Spürbarkeit', () => {
    const fehler: string[] = [];
    expect(parseSystemEffects({ leverage: 5 }, (_k, t) => fehler.push(t))).toBeNull();
    expect(parseSystemEffects({ stations: { cordova: 1.5 } }, (_k, t) => fehler.push(t))).toBeNull();
    expect(parseSystemEffects({ seismik: 0 }, (_k, t) => fehler.push(t))).toBeNull();
    expect(parseSystemEffects({ party: { kaiser: 1 } }, (_k, t) => fehler.push(t))).toBeNull();
    expect(fehler).toHaveLength(4);
    const ev = [{ id: 'x', choices: [{ id: 'a', system: { brand: { atlantis: 3 }, stock: { tulpen: 100 }, leverage: 3 } as SystemEffects }] }];
    const refs = { boardIds: [], laws: [], techs: [], brandRegions: balance.brand.regions.map((r) => r.id), stocks: balance.exchange.stocks.map((x) => x.id), leverages: balance.exchange.margin.leverages };
    expect(checkSystemEffects('f', ev, refs)).toHaveLength(3);
    expect(systemImpact({ brand: { cordova: 10 }, ansehen: 1, favors: 1, seismik: 1 }, balance)).toBeGreaterThan(200);
  });

  it('kein Kapitel-3-Ereignis trägt noch einen TODO-Effekt; alle Wirkungen verweisen auf echte Regionen, Aktien und Räte', () => {
    for (const f of ['k3-alltag-1-marke', 'k3-alltag-2-boerse', 'k3-alltag-3-lobby', 'k3-alltag-4-seismik', 'k3-alltag-5-stand', 'k3-alltag-6-rivalen', 'k3-alltag-7-krise', 'k3-alltag-8-familie', 'k3-story-1-daniel', 'k3-story-2-thomas', 'k3-story-3-ehe', 'k3-story-3-ehe-k2', 'k3-story-4-vale']) {
      expect(readFileSync(new URL(`../../content/events/${f}.yaml`, import.meta.url), 'utf8')).not.toMatch(/TODO-Effekt/);
    }
    const k3Events = catalog.filter((e) => e.id.startsWith('k3_'));
    expect(k3Events.some((e) => e.choices.some((c) => c.system?.brand))).toBe(true);
    const refs = {
      boardIds: [...board.map((b) => b.id), ...Object.keys(balance.eventSystems.boardGuests)],
      laws: balance.laws,
      techs: balance.research.techs.map((t) => t.id),
      brandRegions: balance.brand.regions.map((r) => r.id),
      stocks: balance.exchange.stocks.map((x) => x.id),
      leverages: balance.exchange.margin.leverages,
    };
    expect(checkSystemEffects('content/events', k3Events, refs)).toEqual([]);
  });
});

// --- Ganzer Durchlauf ------------------------------------------------------------------

function springen(s0: GameState, antwort: 0 | 1): GameState {
  const st = startTimeskip(s0, balance, { stance: 'balanced', family: 'some' });
  if (!st.ok) throw new Error(st.reason);
  let s = st.state;
  for (let i = 0; i < 12; i++) {
    const step = runTimeskip(s, balance, catalog, TEXTE);
    if (step.status === 'done') return step.state;
    let a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id][antwort], catalog, TEXTE);
    if (!a.ok) a = answerSwitch(s, balance, step.id, SWITCH_CHOICES[step.id][1 - antwort], catalog, TEXTE);
    if (!a.ok) throw new Error(a.reason);
    s = a.state;
  }
  throw new Error('Zu viele Weichen.');
}

function kapitelSpielen(s0: GameState, mitKapitel3: boolean): GameState {
  let s = s0;
  const rng = new Rng(seedFromString(`${s.seed}:durchlauf:${s.chapter}`));
  for (let i = 0; i < 40 && !s.finished; i++) {
    s = botTurn(s, balance, 'ausgewogen', rng, catalog);
    if (mitKapitel3) s = botChapterSystems(s, balance);
    s = endRound(s, balance, catalog);
    expect(Number.isFinite(s.cash)).toBe(true);
  }
  return s;
}

describe('Ein ganzer Durchlauf Kapitel 1 → 3 mit Bots', () => {
  it('der Standard-Bot spielt alle drei Kapitel mit beiden Zeitsprüngen ohne Absturz; jeder Stand lädt wieder', () => {
    const enden = chapterEnds(balance, 8, catalog);
    let bisKapitel3 = 0;
    let mitMarkeGegruendet = 0;
    for (const [i, e] of enden.entries()) {
      let s = e;
      const ipo = decideIpo(s, balance, canGoPublic(s, balance) ? 0.33 : 0);
      if (ipo.ok) s = ipo.state;
      s = springen(s, (i % 2) as 0 | 1);
      if (s.finished) continue; // Pleite im Zeitsprung I
      expect(s.chapter).toBe(2);
      s = kapitelSpielen(s, false);
      expect(s.finished).toBe(true);
      if (s.ending !== 'kapitel') continue; // frühes Ende in Kapitel 2
      s = springen(s, (i % 2) as 0 | 1);
      if (s.finished) continue;
      expect(s.chapter).toBe(3);
      // Keine Kapitel-2-Geschichte in Kapitel 3. Ereignisse der Rivalen-Diplomatie (Angebote, Rache, Verband …) gelten
      // in jedem Kapitel ab 2 (minChapter 1 ohne maxChapter, die Merkzeichen der Diplomatie entscheiden) und dürfen schon
      // am Kapitelstart liegen.
      expect(s.events.pending.every((id) => !id.startsWith('k2_') || jedesKapitel.has(id))).toBe(true);
      s = kapitelSpielen(s, true);
      expect(s.finished).toBe(true);
      expect(['kapitel', 'pleite', 'verkauft', 'abgesetzt', 'geschluckt', 'haft']).toContain(s.ending);
      expect(s.events.seen.some((id) => id.startsWith('k3_'))).toBe(true);
      // Die Marke gründet der Bot nur mit genug Geld (Gründung + Rücklage); seit der verdeckten Geologie
      // kommen auch arme Partien in Kapitel 3 an, die sie sich nie leisten können.
      if (brandOf(s, balance).founded) mitMarkeGegruendet += 1;
      const r = deserializeGame(serializeGame(s, '0.4.19'));
      expect(r.ok).toBe(true);
      expect(nonFiniteNumbers(s)).toEqual([]);
      bisKapitel3 += 1;
    }
    expect(bisKapitel3).toBeGreaterThanOrEqual(2);
    expect(mitMarkeGegruendet).toBeGreaterThanOrEqual(1);
  });

  it('in Kapitel 2 baut der Bot die Raffinerie, sobald Bau und Rücklage bezahlbar sind (0.4.19+2)', () => {
    const k2 = (cash: number) => openChapterSystems({ ...newGame('bot-raffinerie', balance, catalog), chapter: 2, chapterStart: 1, cash }, balance, TEXTE);
    const reich = botChapterSystems(k2(balance.refinery.buildCost + 20000), balance);
    expect(reich.refinery?.project).toBe('build');
    const arm = k2(balance.refinery.buildCost);
    expect(botChapterSystems(arm, balance)).toBe(arm);
  });

  it('der Bot-Zug an der Marke ändert vor Kapitel 3 nichts und baut in Kapitel 3 Tankstellen', () => {
    const k1 = newGame('bot-marke', balance, catalog);
    expect(botChapterSystems(k1, balance)).toBe(k1);
    const s = botChapterSystems(k3('bot-marke', { cash: 100000 }), balance);
    expect(brandOf(s, balance).founded).toBe(true);
    expect(Object.values(s.brand!.regions).some((r) => r.building.length > 0)).toBe(true);
    // Ohne Geld wartet der Bot.
    const arm = k3('bot-arm', { cash: 1000 });
    expect(botChapterSystems(arm, balance)).toBe(arm);
    expect(buildStations).toBeTypeOf('function');
  });

  it('der Bot baut je Region nach, bis der Marktanteil mit Abstand reicht (0.4.20+6)', () => {
    const p = balance.brand.goal.presenceShare;
    let s = botChapterSystems(k3('bot-anteil', { cash: 500000 }), balance);
    const brand = brandOf(s, balance);
    const gebaut = Object.entries(brand.regions).filter(([, r]) => r.building.length > 0).map(([id]) => id);
    expect(gebaut.length).toBeGreaterThan(0);
    expect(gebaut.length).toBeLessThanOrEqual(balance.brand.goal.regions + 1);
    // perRound gilt je Region: in jeder begonnenen Region genau so viele.
    for (const id of gebaut) expect(buildingCount(brand, id)).toBe(DEFAULT_BRAND_BOT.perRound);
    // Fertig, Anteil reicht mit Abstand: nichts mehr. Anteil knapp darunter: er baut weiter.
    const mit = (share: number): GameState => {
      const b = brandOf(s, balance);
      const regions = Object.fromEntries(
        Object.entries(b.regions).map(([id, r]) => [id, { ...r, stations: Math.max(1, r.stations + r.building.reduce((a, x) => a + x.count, 0)), building: [], last: { demand: 1000, sales: 1000 * share, craneSales: 0, share, craneShare: 0, profit: 0, priceWar: false } }]),
      );
      return { ...s, brand: { ...b, regions } };
    };
    s = mit(p + 0.1);
    expect(botChapterSystems(s, balance)).toBe(s);
    const knapp = mit(p - 0.01);
    expect(Object.values(botChapterSystems(knapp, balance).brand!.regions).some((r) => r.building.length > 0)).toBe(true);
  });

  it('der Bot baut nicht weiter, wo die Tankstellen zuletzt Verlust machten (0.4.20+7)', () => {
    const s = botChapterSystems(k3('bot-verlust', { cash: 500000 }), balance);
    const b = brandOf(s, balance);
    const mit = (profit: number): GameState => {
      const regions = Object.fromEntries(
        Object.entries(b.regions).map(([id, r]) => [id, { ...r, stations: 5, building: [], last: { demand: 1000, sales: 100, craneSales: 0, share: 0.1, craneShare: 0, profit, priceWar: false } }]),
      );
      return { ...s, brand: { ...b, regions } };
    };
    const verlust = mit(-1);
    expect(botChapterSystems(verlust, balance)).toBe(verlust);
    expect(Object.values(botChapterSystems(mit(0), balance).brand!.regions).some((r) => r.building.length > 0)).toBe(true);
  });
});
