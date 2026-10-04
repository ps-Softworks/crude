// Kapitel 3 (4.17) in der Oberfläche: Notizen und Seismik-Berichte als Sätze.
import { describe, expect, it } from 'vitest';
import { newGame } from '../sim/game';
import { parcelLabel } from '../sim/lease';
import { balance } from './balance';
import { noteText, reasonText, reportText } from './kapitel3';

describe('Texte für Kapitel 3', () => {
  const game = newGame('ui-k3', balance);
  const ranch = game.parcels.find((p) => !p.discovery)!;

  it('Notizen setzen Ranch, Betrag, Gefallen und Projekt ein', () => {
    expect(noteText(game, { round: 1, key: 'seismik_auftrag', vars: { ranch: ranch.id, betrag: 6000 } })).toContain(parcelLabel(ranch));
    expect(noteText(game, { round: 1, key: 'seismik_auftrag', vars: { ranch: ranch.id, betrag: 6000 } })).toMatch(/6\.000/);
    expect(noteText(game, { round: 1, key: 'gefallen', vars: { gefallen: 'drosseln' } })).toContain('Förderung drosseln');
    expect(noteText(game, { round: 1, key: 'projekt_angebot', vars: { projekt: 'fernpipeline' } })).toContain('Fernpipeline');
  });

  it('Seismik-Bericht in einer Zeile: Chance und Falle', () => {
    expect(reportText({ parcelId: ranch.id, round: 2, low: 60, high: 70, sizeLow: 1, sizeHigh: 2 })).toBe('60–70 % Fundchance · Falle klein bis mittel');
    expect(reportText({ parcelId: ranch.id, round: 2, low: 10, high: 20, sizeLow: null, sizeHigh: null })).toBe('10–20 % Fundchance · keine Falle zu erkennen');
    expect(reportText({ parcelId: ranch.id, round: 2, low: 80, high: 90, sizeLow: 3, sizeHigh: 3 })).toBe('80–90 % Fundchance · Falle groß');
  });

  it('Gründe als Satz', () => {
    expect(reasonText('technik')).toMatch(/Technikstufe III/);
  });
});
