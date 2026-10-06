import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buyStock, EXCHANGE_HEADLINE_IDS, newExchange, openExchange, type ExchangeState } from './exchange';
import { exchangeLetters, makeExchangePage, parseExchangeContent, stockName, topUpNeeded } from './exchangeContent';
import { newGame } from './game';
import { deserializeGame, serializeGame } from './save';
import { loadBalance } from './testBalance';

const balance = loadBalance();
const EB = balance.exchange;
const IDS = EB.stocks.map((s) => s.id);
const FILE = 'content/exchange.yaml';
const text = readFileSync(new URL('../../content/exchange.yaml', import.meta.url), 'utf8');
const parsed = parseExchangeContent(FILE, text, IDS);
const content = parsed.content!;
const money = (v: number) => `${Math.round(v)} $`;

describe('content/exchange.yaml', () => {
  it('ist vollständig: jede Aktie, jede Schlagzeile, jeder Brief mit deutschem und englischem Text', () => {
    expect(parsed.errors).toEqual([]);
    for (const id of IDS) {
      expect(content.stocks[id].name.de).not.toBe('');
      expect(content.stocks[id].name.en).not.toBe('');
    }
    for (const id of EXCHANGE_HEADLINE_IDS) {
      expect(content.headlines[id].title.en).not.toBe('');
      expect(content.headlines[id].text.de).not.toBe('');
    }
  });

  it('die Zeitung nennt keine Zahlen (GDD §7.2)', () => {
    for (const id of EXCHANGE_HEADLINE_IDS) {
      expect(content.headlines[id].text.de).not.toMatch(/\d+\s*%/);
      expect(content.headlines[id].title.de).not.toMatch(/\d/);
    }
  });

  it('meldet fehlende Aktien und fremde Schlüssel mit Datei', () => {
    const kaputt = parseExchangeContent(FILE, text, [...IDS, 'gibtsnicht']);
    expect(kaputt.content).toBeNull();
    expect(kaputt.errors.some((e) => e.message.includes('gibtsnicht'))).toBe(true);
    const fremd = parseExchangeContent(FILE, text, IDS.slice(1));
    expect(fremd.errors.some((e) => e.message.includes(IDS[0]))).toBe(true);
    const leer = parseExchangeContent(FILE, 'page: { de: X }', IDS);
    expect(leer.content).toBeNull();
    expect(parseExchangeContent(FILE, 'a: [', IDS).errors[0].message).toMatch(/YAML/);
  });
});

describe('Börsenseite und Makler', () => {
  it('die Börsenseite zeigt die Schlagzeile aus exchangeHeadline – auf Englisch, wenn verlangt', () => {
    const ex: ExchangeState = { ...newExchange('s', 1, EB), events: [], fever: EB.warnFrom };
    const de = makeExchangePage(ex, EB, content);
    expect(de.id).toBe('warning');
    expect(de.title).toBe(content.headlines.warning.title.de);
    expect(makeExchangePage(ex, EB, content, undefined, 'en').title).toBe(content.headlines.warning.title.en);
    expect(stockName(content, 'motorwagen')).toBe(content.stocks.motorwagen.name.de);
  });

  it('0.4.20+9: Kurszettel mit allen Aktien; Harlan Oil nur, wenn Kurs und Verlauf mitgegeben werden', () => {
    const ex: ExchangeState = { ...newExchange('s', 1, EB), events: [] };
    const ohne = makeExchangePage(ex, EB, content);
    expect(ohne.quotes.map((q) => q.id)).toEqual(IDS);
    expect(ohne.quotes.every((q) => !q.own && q.price === ex.prices[q.id])).toBe(true);
    const mit = makeExchangePage(ex, EB, content, undefined, 'en', { price: 9, history: [12, 9] });
    expect(mit.quotes).toHaveLength(IDS.length + 1);
    expect(mit.quotes.at(-1)).toEqual({ id: 'own', name: content.own.en, price: 9, change: -0.25, own: true });
    expect(makeExchangePage(ex, EB, content, undefined, undefined, { price: 9, history: [9] }).quotes.at(-1)!.change).toBe(0);
    expect(content.own.de).toBe('Harlan Oil');
  });

  it('Nachschussforderung nennt Aktie und den Betrag, der den Kauf wieder über die Grenze hebt', () => {
    const s = { ...openExchange(newGame('brief', balance), balance), cash: 5000 };
    const r = buyStock(s, balance, 'thorne_bahn', 1000, 5);
    if (!r.ok) throw new Error(r.reason);
    const p = r.state.exchange!.positions[0];
    const preis = (p.loan + 0.3 * p.stake) / p.shares;
    const ex: ExchangeState = { ...r.state.exchange!, prices: { ...r.state.exchange!.prices, thorne_bahn: preis }, positions: [{ ...p, called: true }] };
    const briefe = exchangeLetters(ex, EB, content, money);
    expect(briefe).toHaveLength(1);
    expect(briefe[0].id).toBe('call');
    const betrag = topUpNeeded(ex, EB, ex.positions[0]);
    expect(briefe[0].text).toContain(content.stocks.thorne_bahn.name.de);
    expect(briefe[0].text).toContain(money(betrag));
    // Nach genau diesem Nachschuss liegt das Eigenkapital wieder auf der Grenze.
    const equity = p.shares * preis - p.loan + betrag;
    expect(equity).toBeGreaterThanOrEqual(EB.margin.call * (p.stake + betrag) - 1e-6);
  });

  it('Zwangsverkauf mit und ohne Fehlbetrag', () => {
    const ex: ExchangeState = { ...newExchange('s', 1, EB), liquidated: [{ stock: 'motorwagen', shortfall: 1234 }, { stock: 'handelsbank', shortfall: 0 }] };
    const briefe = exchangeLetters(ex, EB, content, money);
    expect(briefe.map((b) => b.id)).toEqual(['liquidated', 'liquidated_even']);
    expect(briefe[0].text).toContain('1234 $');
  });
});

describe('Spielstand mit Börse', () => {
  it('wird gesichert und geladen; eine kaputte Börse macht den Stand unvollständig', () => {
    const s = openExchange(newGame('sichern', balance), balance);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok).toBe(true);
    if (geladen.ok) expect(geladen.state.exchange).toEqual(s.exchange);
    const kaputt = { ...s, exchange: { ...s.exchange!, prices: { thorne_bahn: 'viel' } } };
    expect(deserializeGame(serializeGame(kaputt as never, 'test')).ok).toBe(false);
  });

  it('Spielstände ohne Börse (Kapitel 1) laden weiter', () => {
    const s = newGame('ohne', balance);
    const geladen = deserializeGame(serializeGame(s, 'test'));
    expect(geladen.ok).toBe(true);
    if (geladen.ok) expect(geladen.state.exchange).toBeUndefined();
  });
});
