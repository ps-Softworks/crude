import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePipelineContent, UI_KEYS, uiText } from './bigPipelineContent';
import { newGame } from './game';
import { buyerPrice, tariff } from './transport';
import { trunkSavings } from './trunkSavings';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const state = () => ({ ...newGame('nutzen', balance), railTariff: 0.5 });

describe('Fernleitung: Nutzen (trunkSavings)', () => {
  it('Hafen: Weg Pipeline statt Bahntarif spart Geld, Amortisation aus den Kosten', () => {
    const s = state();
    const supply = 30_000;
    const r = trunkSavings(s, balance, { bypassesRail: true, length: 20, cost: 100_000, supply });
    expect(tariff(s, balance, 'rail')).toBeGreaterThan(tariff(s, balance, 'pipeline'));
    expect(r.gain).toBeGreaterThan(0);
    expect(r.after).toBeGreaterThan(r.before);
    expect(r.net).toBe(r.gain - r.upkeep);
    expect(r.payback).toBe(Math.max(1, Math.ceil(100_000 / r.net)));
    // Beispiel: 30.000 bbl je Runde, 7.000 bbl blieben liegen, 23.000 wechseln von der Bahn auf die Leitung.
    expect(r).toMatchObject({ before: 18330, after: 38400, gain: 20070, upkeep: 800, net: 19270, stuck: 7000, moved: 23000, payback: 6 });
  });

  it('ohne Förderung bringt die Leitung nichts und bezahlt sich nie', () => {
    const r = trunkSavings(state(), balance, { bypassesRail: true, length: 20, cost: 50_000, supply: 0 });
    expect(r.gain).toBe(0);
    expect(r.payback).toBeNull();
  });

  it('Bahnhof: nur Nutzen, wenn heute Öl liegen bleibt', () => {
    const s = state();
    const klein = trunkSavings(s, balance, { bypassesRail: false, length: 10, cost: 50_000, supply: 100 });
    expect(klein.stuck).toBe(0);
    expect(klein.gain).toBe(0);
    expect(klein.payback).toBeNull();
    const viel = trunkSavings(s, balance, { bypassesRail: false, length: 10, cost: 50_000, supply: 40_000 });
    expect(viel.stuck).toBeGreaterThan(0);
    // Mindestens der Verkauf des liegen gebliebenen Öls (dazu kommen Wechsel von teureren Wegen).
    expect(viel.gain).toBeGreaterThanOrEqual(Math.floor(viel.stuck * (buyerPrice(s, balance) - tariff(s, balance, 'rail'))) - 1);
  });
});

describe('Fernleitung: Oberflächentexte (content/pipelines.yaml, Abschnitt ui)', () => {
  const text = readFileSync(new URL('../../content/pipelines.yaml', import.meta.url), 'utf8');

  it('alle Schlüssel sind da, de und en', () => {
    const geladen = parsePipelineContent('content/pipelines.yaml', text);
    expect(geladen.errors).toEqual([]);
    for (const key of UI_KEYS) expect(geladen.content!.ui[key].en, key).not.toBe('');
  });

  it('fehlender Schlüssel wird gemeldet', () => {
    const kaputt = text.replace(/\n {2}benefitNone:\n {4}de: .*\n {4}en: .*\n/, '\n');
    const geladen = parsePipelineContent('content/pipelines.yaml', kaputt);
    expect(geladen.errors.some((e) => e.message.includes('ui.benefitNone'))).toBe(true);
  });

  it('Nutzenzeile füllt die Platzhalter', () => {
    const c = parsePipelineContent('content/pipelines.yaml', text).content!;
    expect(uiText(c, 'benefitGain', { gain: '19.270,00 $', n: 6, roundWord: 'Runden' })).toBe('Spart bei heutiger Förderung etwa 19.270,00 $ je Runde – bezahlt in etwa 6 Runden.');
  });
});
