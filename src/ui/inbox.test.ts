import { describe, expect, it } from 'vitest';
import { deskEvents, deskMail, deskRoutines, type DeskEvent } from '../sim/events';
import { newGame } from '../sim/game';
import { loadBalance } from '../sim/testBalance';
import { loadEvents } from '../sim/testEvents';
import { figureCatalog } from './figureCatalog.node';
import { bankruptcyDeadlineOf, eventsShownIn, inboxBadges, landDeadlines, openItems, seenKey, sortInbox, unseen, visitorNames } from './inbox';
import { appearancesOf } from './visitors';

function ereignis(id: string, extra: Partial<DeskEvent> = {}): DeskEvent {
  return { id, title: id, text: '', choices: [], roundsLeft: 2, urgent: false, ...extra };
}

describe('Was auf dem Schreibtisch liegt', () => {
  const brief = ereignis('brief', { mail: 'offer' });
  const dringend = ereignis('mahnung', { mail: 'demand', urgent: true, roundsLeft: 1 });
  const silas = ereignis('silas_schnaps');
  const brand = ereignis('brand_nachbar', { urgent: true });
  const streit = ereignis('streit');
  const termin = ereignis('kirche');
  const pending = [brief, silas, dringend, brand, streit];
  const mail = [dringend, brief];

  it('legt ohne Besetzung alles ohne Brief an den Notizspieß', () => {
    const inbox = sortInbox(pending, mail, [termin]);
    expect(inbox.letters.map((e) => e.id)).toEqual(['mahnung', 'brief']);
    expect(inbox.incidents.map((e) => e.id)).toEqual(['silas_schnaps', 'brand_nachbar', 'streit']);
    expect(inbox.visitors).toEqual([]);
    expect(inbox.routines.map((e) => e.id)).toEqual(['kirche']);
  });

  it('verteilt nach Besetzung auf Besucher und Tableaus', () => {
    const inbox = sortInbox(pending, mail, [], { silas_schnaps: { kind: 'visitor', figure: 'silas', name: 'Silas' }, brand_nachbar: { kind: 'tableau' } });
    expect(inbox.visitors.map((e) => e.id)).toEqual(['silas_schnaps']);
    expect(inbox.tableaus.map((e) => e.id)).toEqual(['brand_nachbar']);
    expect(inbox.incidents.map((e) => e.id)).toEqual(['streit']);
  });

  it('zählt für die Abzeichen und merkt sich Fristen', () => {
    const b = inboxBadges(sortInbox(pending, mail, [termin]));
    expect(b.post).toEqual({ count: 2, urgent: true, fresh: false });
    expect(b.vorfaelle).toEqual({ count: 3, urgent: true, fresh: false });
    expect(b.termine).toEqual({ count: 1, urgent: false, fresh: false });
    expect(b.tuer).toEqual({ count: 0, urgent: false, fresh: false });
  });

  it('listet an der Glocke, was noch offen ist', () => {
    const inbox = sortInbox(pending, mail, [termin], { silas_schnaps: { kind: 'visitor', figure: 'silas', name: 'Silas' } });
    const items = openItems(inbox, { left: 3 });
    expect(items.map((i) => i.target)).toEqual(['tuer', 'post', 'vorfaelle', 'termine']);
    expect(items[0].text).toBe('Silas wartet vor der Tür');
    expect(items[1]).toMatchObject({ urgent: true, text: '2 Briefe unbeantwortet – einer mit Frist in dieser Runde' });
    expect(items[3].text).toBe('1 fester Termin im Kalender wartet noch (freiwillig, 3 Termine frei)');
    // Ohne freie Termine ist der Kalender kein offener Punkt.
    expect(openItems(inbox, { left: 0 }).map((i) => i.target)).not.toContain('termine');
    expect(openItems(sortInbox([], [], []), { left: 5 })).toEqual([]);
    // 0.4.20+44: offene Empfehlungen im Adressbuch.
    expect(openItems(sortInbox([], [], []), { left: 5 }, null, 0, 2)).toEqual([{ target: 'termine', text: '2 Empfehlungen im Adressbuch – jemand will dich vorstellen', urgent: false }]);
  });

  it('die Pleitefrist steht dringend ganz vorn und führt ins Kassenbuch', () => {
    const items = openItems(sortInbox([], [], []), { left: 0 }, null, 7);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ target: 'kassenbuch', urgent: true });
    expect(items[0].text).toMatch(/Bankrott droht! Bis Runde 7/);
    expect(bankruptcyDeadlineOf({ bankruptcyDeadline: 7, finished: true })).toBe(0);
  });

  it('warnt an der Glocke vor Land, das nach dieser Runde verfällt (0.2.15+12)', () => {
    const balance = loadBalance();
    const events = loadEvents();
    const game = newGame('frist-test', balance, events);
    const eigene = game.options.filter((o) => o.holder === 'jacob');
    expect(eigene.length).toBeGreaterThan(0);
    // Am Start ist noch Zeit: nichts verfällt.
    expect(landDeadlines(game).options).toBe(0);
    // In der letzten Runde der Optionen zählt jede mit, die erste Ranch ist das Ziel.
    const spaet = { ...game, round: Math.max(...eigene.map((o) => o.expiresAfterRound)) };
    const land = landDeadlines(spaet);
    expect(land.options).toBe(eigene.filter((o) => o.expiresAfterRound <= spaet.round).length);
    expect(land.parcelId).not.toBeNull();
    const items = openItems(sortInbox([], [], []), { left: 0 }, land);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ target: 'karte', urgent: true, parcelId: land.parcelId });
    expect(items[0].text).toMatch(/Option(en)? verf(ällt|allen) nach dieser Runde → Wandkarte/);
    // Gebohrte Pachten verfallen nie; ungebohrte in ihrer letzten Runde schon.
    const pacht = { parcelId: 'p1', holder: 'jacob' as const, bonus: 0, royalty: 0.125, startRound: 1, expiresAfterRound: 3, drilled: false };
    expect(landDeadlines({ round: 3, options: [], leases: [pacht] })).toEqual({ options: 0, leases: 1, parcelId: 'p1' });
    expect(landDeadlines({ round: 2, options: [], leases: [pacht] }).leases).toBe(0);
    expect(landDeadlines({ round: 3, options: [], leases: [{ ...pacht, drilled: true }] }).leases).toBe(0);
    expect(openItems(sortInbox([], [], []), { left: 0 }, { options: 1, leases: 1, parcelId: 'p1' })[0].text).toBe(
      '1 Option und 1 ungebohrte Pacht verfallen nach dieser Runde → Wandkarte',
    );
  });

  it('merkt sich, was neu ist (2b): ein Abzeichen ist „neu“, bis das Fenster offen war', () => {
    const inbox = sortInbox(pending, mail, [termin]);
    expect(inboxBadges(inbox, []).post.fresh).toBe(true);
    const gesehen = eventsShownIn(inbox, 'post').map((e) => seenKey(e.id));
    expect(gesehen).toEqual(['ev:mahnung', 'ev:brief']);
    expect(inboxBadges(inbox, gesehen).post.fresh).toBe(false);
    expect(inboxBadges(inbox, gesehen).vorfaelle.fresh).toBe(true);
    expect(unseen(inbox.incidents, ['ev:streit']).map((e) => e.id)).toEqual(['silas_schnaps', 'brand_nachbar']);
    expect(eventsShownIn(inbox, 'kassenbuch')).toEqual([]);
  });

  it('nennt die Wartenden an der Tür beim Namen', () => {
    const zwei = sortInbox([silas, ereignis('ruth_sorge')], [], [], {
      silas_schnaps: { kind: 'visitor', figure: 'silas', name: 'Silas' },
      ruth_sorge: { kind: 'visitor', figure: 'ruth', name: 'Ruth' },
    });
    expect(openItems(zwei, { left: 0 })[0].text).toBe('Silas und ein weiterer warten vor der Tür');
  });

  it('wessen Frist abläuft, steht an der Tür vorn – sonst bleibt die Reihenfolge (0.2.15+11)', () => {
    const besetzung = {
      silas_schnaps: { kind: 'visitor', figure: 'silas', name: 'Silas' },
      ruth_sorge: { kind: 'visitor', figure: 'ruth', name: 'Ruth' },
      moss_dank: { kind: 'visitor', figure: 'moss', name: 'Moss' },
    } as const;
    const silas2 = ereignis('silas_schnaps', { roundsLeft: 2 });
    const ruth = ereignis('ruth_sorge', { roundsLeft: 1, urgent: true });
    const moss = ereignis('moss_dank', { roundsLeft: 2 });
    const inbox = sortInbox([silas2, moss, ruth], [], [], besetzung);
    expect(inbox.visitors.map((e) => e.id)).toEqual(['ruth_sorge', 'silas_schnaps', 'moss_dank']);
    expect(visitorNames(inbox)).toEqual(['Ruth', 'Silas', 'Moss']);
  });

  it('zählt im echten Spiel genau die Ereignisse aus der Simulation', () => {
    const balance = loadBalance();
    const events = loadEvents();
    const game = newGame('inbox-test', balance, events);
    const alle = deskEvents(game, balance, events);
    const inbox = sortInbox(alle, deskMail(game, balance, events), deskRoutines(game, balance, events), appearancesOf(events, figureCatalog));
    expect(inbox.letters.length + inbox.incidents.length + inbox.visitors.length + inbox.tableaus.length).toBe(alle.length);
  });
});
