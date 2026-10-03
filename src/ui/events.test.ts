// Fertig-Kriterium 2.2: Die Oberfläche lädt jede .yaml-Datei aus content/events/
// selbst – es gibt keine Liste im Code, die man pflegen müsste.
import { describe, expect, it } from 'vitest';
import { loadEvents } from '../sim/testEvents';
import { events } from './events';

describe('Ereignisse in der Oberfläche', () => {
  it('sind genau die Ereignisse aus allen Dateien in content/events/', () => {
    expect(events.map((e) => e.id)).toEqual(loadEvents().map((e) => e.id));
    expect(events).toEqual(loadEvents());
  });
});
