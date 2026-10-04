import { describe, expect, it } from 'vitest';
import { deskEvents, deskMail, deskRoutines, type DeskEvent } from '../sim/events';
import { newGame } from '../sim/game';
import { loadBalance } from '../sim/testBalance';
import { loadEvents } from '../sim/testEvents';
import { inboxBadges, openItems, sortInbox } from './inbox';

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
    const inbox = sortInbox(pending, mail, [], { silas_schnaps: { kind: 'visitor', figure: 'silas' }, brand_nachbar: { kind: 'tableau' } });
    expect(inbox.visitors.map((e) => e.id)).toEqual(['silas_schnaps']);
    expect(inbox.tableaus.map((e) => e.id)).toEqual(['brand_nachbar']);
    expect(inbox.incidents.map((e) => e.id)).toEqual(['streit']);
  });

  it('zählt für die Abzeichen und merkt sich Fristen', () => {
    const b = inboxBadges(sortInbox(pending, mail, [termin]));
    expect(b.post).toEqual({ count: 2, urgent: true });
    expect(b.vorfaelle).toEqual({ count: 3, urgent: true });
    expect(b.termine).toEqual({ count: 1, urgent: false });
    expect(b.tuer).toEqual({ count: 0, urgent: false });
  });

  it('listet an der Glocke, was noch offen ist', () => {
    const inbox = sortInbox(pending, mail, [termin], { silas_schnaps: { kind: 'visitor', figure: 'silas' } });
    const items = openItems(inbox, { left: 3 });
    expect(items.map((i) => i.target)).toEqual(['tuer', 'post', 'vorfaelle', 'termine']);
    expect(items[1]).toMatchObject({ urgent: true, text: '2 Briefe unbeantwortet – einer mit Frist in dieser Runde' });
    expect(items[3].text).toBe('3 Termine frei – 1 fester Termin im Kalender');
    // Ohne freie Termine ist der Kalender kein offener Punkt.
    expect(openItems(inbox, { left: 0 }).map((i) => i.target)).not.toContain('termine');
    expect(openItems(sortInbox([], [], []), { left: 5 })).toEqual([]);
  });

  it('zählt im echten Spiel genau die Ereignisse aus der Simulation', () => {
    const balance = loadBalance();
    const events = loadEvents();
    const game = newGame('inbox-test', balance, events);
    const alle = deskEvents(game, balance, events);
    const inbox = sortInbox(alle, deskMail(game, balance, events), deskRoutines(game, balance, events));
    expect(inbox.letters.length + inbox.incidents.length).toBe(alle.length);
  });
});
