// Kapitel 3, Story-Bögen (Phase 4): Daniel, Thomas, Ehe, Vales Karte – content/events/k3-story-*.yaml.
// Spielt die Bögen mit festen Kapitel-1-Merkzeichen durch (nur Kapitel 3, nur k3-Ereignisse) und prüft,
// dass jede Verzweigung zu ihrer Vorgeschichte passt. Entwurf – Philipp überarbeitet.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBalance } from './testBalance';
import { parseEventFiles } from './eventContent';
import { defaultChoice, drawEvents, resolveEvent, type EventDef } from './events';
import { newGame, type GameState } from './game';
import { EVENTS_DIR, loadEvents, readEventFiles } from './testEvents';

const balance = loadBalance();
const katalog = loadEvents();
const k3 = katalog.filter((e) => e.id.startsWith('k3_'));

/**
 * Spielt Kapitel 3 mit den gegebenen Merkzeichen aus Kapitel 1. Antworten: wahl[ereignis] = wahl-id;
 * alles andere bekommt die Standard-Wahl. Geld und Kraft reichen immer (es geht um die Verzweigung).
 * Ergebnis: Reihenfolge der Ereignisse und die Merkzeichen am Ende.
 */
function spiele(k1: string[], wahl: Record<string, string> = {}): { seen: string[]; marks: Set<string> } {
  let s: GameState = { ...newGame('k3-story', balance), chapter: 3 };
  s = { ...s, events: { ...s.events, pending: [], marks: Object.fromEntries(k1.map((m) => [m, 0])) } };
  for (let r = 1; r <= 16; r++) {
    s = { ...s, round: r, cash: 1e6, strength: 100, sick: 0 };
    s = drawEvents(s, balance, k3);
    // Alles, was kam, wird noch in dieser Runde beantwortet – gewählt oder mit der Standard-Wahl.
    for (const id of [...s.events.pending]) {
      const w = wahl[id] ?? defaultChoice(s, ereignis(id))?.id;
      if (!w) throw new Error(`${id}: keine Wahl möglich`);
      const res = resolveEvent({ ...s, agenda: { budget: 999, used: 0, done: [] } }, balance, k3, id, w);
      if (!res.ok) throw new Error(`${id}/${w}: ${res.reason}`);
      s = res.state;
    }
  }
  return { seen: s.events.seen, marks: new Set(Object.keys(s.events.marks)) };
}

function ereignis(id: string): EventDef {
  const e = k3.find((x) => x.id === id);
  if (!e) throw new Error(`fehlt: ${id}`);
  return e;
}

describe('Kapitel 3 – Story-Bögen', () => {
  it('alle k3-Ereignisse gelten nur in Kapitel 3', () => {
    expect(k3.length).toBeGreaterThan(40);
    for (const e of k3) {
      expect(e.conditions.minChapter, e.id).toBe(3);
      expect(e.conditions.maxChapter, e.id).toBe(3);
    }
    for (const id of ['k3_daniel_wahl', 'k3_daniel_antritt', 'k3_moss_beerdigung', 'k3_daniel_akte_moss', 'k3_daniel_angebot', 'k3_thomas_heimkehr', 'k3_thomas_weg', 'k3_thomas_bruch', 'k3_ruth_ball', 'k3_ruth_vale', 'k3_ruth_abwesend', 'k3_ruth_wendepunkt', 'k3_vale_karte']) {
      expect(k3.map((e) => e.id)).toContain(id);
    }
  });

  describe('Daniel Moss', () => {
    it('genau eine Akte je Vorgeschichte (Moss, Sheriff, Kerrigan, Pike, sonst Zeuge)', () => {
      const akten = (k1: string[]) => spiele(k1).seen.filter((id) => id.startsWith('k3_daniel_akte_'));
      expect(akten(['moss_feind', 'moss_betrogen', 'sheriff_bezahlt', 'kerrigan_verheizt'])).toEqual(['k3_daniel_akte_moss']);
      expect(akten(['moss_fair', 'sheriff_bezahlt', 'pike_urkunde_falsch'])).toEqual(['k3_daniel_akte_sheriff']);
      expect(akten(['moss_fair', 'kerrigan_verheizt', 'pike_urkunde_falsch'])).toEqual(['k3_daniel_akte_kerrigan']);
      expect(akten(['moss_abgewiesen', 'pike_urkunde_falsch'])).toEqual(['k3_daniel_akte_pike']);
      expect(akten(['moss_fair'])).toEqual(['k3_daniel_akte_zeuge']);
    });

    it('Zeuge abgelehnt und nicht erschienen: Beugehaft, aber kein Vergleich und keine Anklage gegen Jacob', () => {
      const { seen, marks } = spiele(['moss_fair']);
      expect(seen).toContain('k3_daniel_vorladung');
      expect(seen).toContain('k3_daniel_missachtung');
      for (const id of seen) expect(id, id).not.toMatch(/^k3_daniel_(angebot|anklage)/);
      expect(marks.has('daniel_anwaelte')).toBe(false);
      expect(marks.has('daniel_beugehaft')).toBe(true);
    });

    it('Bestechung führt zur Anklage und ist teurer als jeder Weg über die Anwälte', () => {
      const { seen, marks } = spiele(['moss_fair', 'sheriff_bezahlt'], { k3_daniel_akte_sheriff: 'bestechen' });
      expect(seen).toContain('k3_daniel_bestechung_folge');
      expect(seen).toContain('k3_daniel_anklage_bestechung');
      expect(marks.has('daniel_anklage')).toBe(true);
      // Kosten in $ – billigster Weg je Pfad (ohne Kraft, die beim Bestechen noch dazukommt).
      const geld = (eid: string, cid: string) => -(ereignis(eid).choices.find((c) => c.id === cid)!.effects.cash ?? 0);
      const billigste = (eid: string) => Math.min(...ereignis(eid).choices.map((c) => -(c.effects.cash ?? 0)));
      const anwaltTeuerster = geld('k3_daniel_akte_sheriff', 'anwaelte') + Math.max(
        ...['k3_daniel_angebot', 'k3_daniel_anklage', 'k3_daniel_anklage_feind'].flatMap((eid) => ereignis(eid).choices.map((c) => -(c.effects.cash ?? 0))),
      );
      const bestechungBilligster = geld('k3_daniel_akte_sheriff', 'bestechen') + billigste('k3_daniel_bestechung_folge') + billigste('k3_daniel_anklage_bestechung');
      expect(bestechungBilligster).toBeGreaterThan(anwaltTeuerster);
    });

    it('Kooperation im Moss-Fall: eigener Ausgang, keine Thorne-Rache, kein Bündnis über Ezekiel', () => {
      const { seen, marks } = spiele(['moss_feind', 'moss_betrogen'], { k3_daniel_akte_moss: 'kooperieren' });
      expect(seen).toContain('k3_daniel_ergebnis_moss');
      expect(seen).not.toContain('k3_daniel_zeuge_folge');
      expect(marks.has('daniel_verbuendet')).toBe(false);
      expect(marks.has('daniel_anklage') || marks.has('daniel_vergleich')).toBe(true);
    });

    it('Kooperation im Sheriff- und Kerrigan-Fall endet in Vergleich oder Anklage, im Pike-Fall entlastet', () => {
      const sheriff = spiele(['moss_fair', 'sheriff_bezahlt'], { k3_daniel_akte_sheriff: 'kooperieren', k3_daniel_kronzeuge: 'aussagen' });
      expect(sheriff.seen).toContain('k3_daniel_kronzeuge');
      expect(sheriff.marks.has('daniel_vergleich')).toBe(true);
      const kerrigan = spiele(['moss_fair', 'kerrigan_verheizt'], { k3_daniel_akte_kerrigan: 'kooperieren' });
      expect(kerrigan.seen).toContain('k3_daniel_ergebnis_kerrigan');
      expect(kerrigan.marks.has('daniel_anklage')).toBe(true);
      const pike = spiele(['moss_abgewiesen', 'pike_urkunde_falsch'], { k3_daniel_akte_pike: 'kooperieren' });
      expect(pike.marks.has('daniel_entlastet')).toBe(true);
      for (const id of pike.seen) expect(id).not.toMatch(/^k3_daniel_(angebot|anklage)/);
    });

    it('Thornes Rache (Pettibone, „Nötigung eines Zeugen“) nur nach einer Aussage gegen Thorne', () => {
      expect(ereignis('k3_daniel_zeuge_folge').marked).toEqual(['daniel_zeuge_thorne']);
      const { seen, marks } = spiele(['moss_fair'], { k3_daniel_akte_zeuge: 'aussagen', k3_daniel_zeuge_folge: 'mit_daniel' });
      expect(seen).toContain('k3_daniel_zeuge_folge');
      expect(marks.has('daniel_verbuendet')).toBe(true);
    });

    it('die Anklage nennt nur dem Feind ein Datum aus Kapitel 1 – sonst keine Veranda, kein Tag', () => {
      const text = (id: string) => `${ereignis(id).text.de} ${ereignis(id).text.en}`;
      expect(text('k3_daniel_anklage')).not.toMatch(/Veranda|porch|Datum|date/);
      expect(ereignis('k3_daniel_anklage').notMarked).toContain('moss_feind');
      expect(ereignis('k3_daniel_anklage_feind').marked).toContain('moss_feind');
      for (const e of k3) expect(`${e.text.de}`, e.id).not.toMatch(/Veranda/);
      const fair = spiele(['moss_fair', 'sheriff_bezahlt'], { k3_moss_beerdigung: 'kranz' });
      expect(fair.seen).toContain('k3_daniel_anklage');
      expect(fair.seen).not.toContain('k3_daniel_anklage_feind');
      const feind = spiele(['moss_feind', 'moss_vertrieben']);
      expect(feind.seen).toContain('k3_daniel_anklage_feind');
      expect(feind.seen).not.toContain('k3_daniel_anklage');
    });

    it('daniel_gefoerdert: Vorwarnung vor der Akte; wer eine Gefälligkeit verlangt, bekommt kein Angebot', () => {
      // Beerdigung besucht – sonst sperrt der Kranz (moss_beerdigung_verpasst) das Angebot ohnehin.
      const offen = spiele(['moss_fair', 'daniel_gefoerdert', 'sheriff_bezahlt'], { k3_moss_beerdigung: 'mit_ruth' });
      const i = offen.seen.indexOf('k3_daniel_vorwarnung');
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(offen.seen.indexOf('k3_daniel_akte_sheriff'));
      expect(offen.seen).toContain('k3_daniel_angebot');
      const gefaellig = spiele(['moss_fair', 'daniel_gefoerdert', 'sheriff_bezahlt'], { k3_moss_beerdigung: 'mit_ruth', k3_daniel_vorwarnung: 'gefaelligkeit' });
      expect(gefaellig.seen).not.toContain('k3_daniel_angebot');
      expect(gefaellig.seen).toContain('k3_daniel_anklage');
    });

    it('wegerecht_moss: Daniel findet keine Enteignung; moss_verloren hat einen eigenen Antritt', () => {
      expect(spiele(['moss_fair', 'wegerecht_moss']).seen).toContain('k3_daniel_wegerecht');
      const fremd = spiele(['moss_abgewiesen', 'moss_verloren']).seen;
      expect(fremd).toContain('k3_daniel_antritt_fremd');
      expect(fremd).not.toContain('k3_daniel_antritt_neutral');
    });

    it('Trost öffnet das Angebot mit dem Schulheft nur dem Feind', () => {
      expect(ereignis('k3_daniel_angebot_trost').marked).toContain('moss_feind');
      const verloren = spiele(['moss_abgewiesen', 'moss_verloren'], { k3_moss_grab: 'hingehen', k3_daniel_akte_zeuge: 'verweigern' });
      expect(verloren.seen).not.toContain('k3_daniel_angebot_trost');
    });
  });

  describe('Thomas', () => {
    it('der Bruch passt zum Weg: bei Harlan Oil „Thomas packt“, bei Crane Eastern eine eigene Fassung', () => {
      const crane = spiele([], { k3_thomas_weg: 'eigener_weg', k3_thomas_brief: 'zurueck' }).seen;
      expect(crane).toContain('k3_thomas_bruch_crane');
      expect(crane).not.toContain('k3_thomas_bruch');
      const firma = spiele([], { k3_thomas_weg: 'firma' }).seen;
      expect(firma).toContain('k3_thomas_bruch');
      expect(firma).not.toContain('k3_thomas_bruch_crane');
    });
  });

  describe('Ehe', () => {
    it('keine Doppelung mit Kapitel 2: kein „Datum aus der Kiste“, kein Grundbuch-Fund, ruth_vertroestet ohne Auftritt', () => {
      const ids = k3.map((e) => e.id);
      expect(ids).not.toContain('k3_ruth_datum');
      expect(ids).not.toContain('k3_ruth_hannah');
      for (const e of k3) {
        expect(e.marked, e.id).not.toContain('ruth_vertroestet');
        // „Grundbuchamt“ (k3_reserveland_folge, Alltag Kapitel 3) ist kein Grundbuch-Fund.
        expect(e.text.de, e.id).not.toMatch(/Datum aufgeschrieben|Grundbuch(?!amt)/);
      }
    });

    it('Ruth legt Vales Karte erst vor, wenn sie gekommen ist – und nur, wenn sie noch im Mantel steckt', () => {
      expect(ereignis('k3_ruth_vale').marked).toEqual(['vale_karte_offen']);
      // 0.4.19+2: Die Karte ist keine zweite Einladung – zu- oder absagen geht nur im Brief des Konsortiums.
      for (const id of ['k3_vale_karte', 'k3_vale_karte_schuld', 'k3_vale_karte_respekt']) {
        expect(ereignis(id).text.de, id).toMatch(/grauen Siegel/);
        expect(ereignis(id).text.de, id).not.toMatch(/Hohenbrück/);
        for (const c of ereignis(id).choices) expect(c.marks, `${id}/${c.id}`).not.toContain('vale_k3_zugesagt');
      }
      for (const id of ['k3_vale_karte', 'k3_vale_karte_schuld', 'k3_vale_karte_respekt']) {
        // Nur „in den Mantel“ lässt die Karte für Ruth liegen; die Voreinstellung ist genau das.
        expect(ereignis(id).choices.filter((c) => c.marks.includes('vale_karte_offen')).map((c) => c.id), id).toEqual(['liegen']);
        expect(ereignis(id).choices.find((c) => c.default)?.id, id).toBe('liegen');
      }
      for (const k1 of [[], ['vale_geld'], ['vale_abgelehnt']]) {
        const { seen } = spiele(k1);
        const karte = seen.findIndex((id) => id.startsWith('k3_vale_karte'));
        expect(karte, String(k1)).toBeGreaterThanOrEqual(0);
        expect(seen.filter((id) => id.startsWith('k3_vale_karte')), String(k1)).toHaveLength(1);
        expect(seen.indexOf('k3_ruth_vale'), String(k1)).toBeGreaterThan(karte);
      }
    });

    it('Probe 3 trifft keine intakte Ehe: Wer alle Proben besteht, kann den guten Wendepunkt erreichen', () => {
      const gut = { k3_ruth_ball: 'verteidigen', k3_ruth_vale: 'fragen' };
      const intakt = spiele([], gut);
      expect(intakt.seen).not.toContain('k3_ruth_abwesend');
      expect(intakt.seen).not.toContain('k3_ruth_abwesend_geburt');
      expect(intakt.seen).toContain('k3_ruth_wendepunkt');
      // Alte Wunde aus Kapitel 1: Probe 3 kommt, wer heimfährt, bleibt beim guten Wendepunkt.
      const wunde = spiele(['geburt_verpasst'], { ...gut, k3_ruth_abwesend_geburt: 'heim' });
      expect(wunde.seen).toContain('k3_ruth_abwesend_geburt');
      expect(wunde.seen).toContain('k3_ruth_wendepunkt');
      // Standard-Wahlen: Riss beim Ball, dann Probe 3 (nur eine Fassung), dann der fremde Wendepunkt.
      const passiv = spiele(['geburt_verpasst']);
      expect(passiv.seen).toContain('k3_ruth_abwesend');
      expect(passiv.seen).not.toContain('k3_ruth_abwesend_geburt');
      expect(passiv.seen).toContain('k3_ruth_wendepunkt_fremd');
    });

    it('Folge-Szenen zu Ruths Kapitel-2-Bogen (k3-story-3-ehe-k2.yaml) sind geladen und hängen an Kapitel-2-Merkzeichen', () => {
      // Integration: phase4/inhalte-k2-story ist gemergt, die früher in content/events/nach-k2/ wartende
      // Datei liegt jetzt in content/events/. Jede der drei Szenen liest ein Merkzeichen aus Kapitel 2.
      expect(existsSync(join(EVENTS_DIR, 'nach-k2'))).toBe(false);
      const erwartet: Record<string, string> = { k3_ruth_laden: 'ruth_eigenes_geschaeft', k3_ruth_kiste: 'ruth_vertroestet_k2', k3_ruth_plaetze: 'ruth_verboten' };
      for (const [id, mark] of Object.entries(erwartet)) expect(ereignis(id).marked, id).toContain(mark);
      const { errors } = parseEventFiles(readEventFiles(EVENTS_DIR));
      expect(errors).toEqual([]);
    });
  });
});
