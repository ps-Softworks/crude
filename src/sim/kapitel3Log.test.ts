// Kapitel 3 (4.17) in Rundenbericht und Kladde: Was die Rundenabrechnung bewegt –
// Geld, Rauswurf, aufgeflogenes Doppelspiel, Projekte –, steht danach in state.log.
import { describe, expect, it } from 'vitest';
import { formatDate } from './calendar';
import { roundLog } from './desk';
import { endRound } from './game';
import { kapitel3Of } from './kapitel3';
import { kapitel3NoteText, logKapitel3Notes } from './kapitel3Log';
import { advanceKapitel3 } from './kapitel3Runde';
import { answerInvitation, expelledCost } from './konsortium';
import { joinProject } from './projekte';
import { loadBalance } from './testBalance';
import { k3Game, k3Round, k3Rounds, loadKapitel3Texts, ok, withK3 } from './testKapitel3';

const balance = loadBalance();
const texts = loadKapitel3Texts();
const K = balance.kapitel3.konsortium;

/** Mitglied (oder Doppelspieler) gleich nach der Einladung. */
function beigetreten(seed: string, weg: 'annehmen' | 'ausspielen', b = balance) {
  const s = k3Rounds(k3Game(seed, b), b, K.inviteRound - 1);
  return ok(answerInvitation(s, b, weg));
}

/** Neue Logzeilen einer Runde. */
function neueZeilen(vorher: { log: string[] }, nachher: { log: string[] }): string[] {
  return nachher.log.slice(vorher.log.length);
}

describe('Kapitel 3 in der Kladde', () => {
  it('Kartellgewinn: Betrag und Grund stehen im Protokoll', () => {
    const s = beigetreten('log-kartell', 'annehmen');
    const t = k3Round(s, balance, texts);
    expect(t.cash).toBe(s.cash + K.memberIncome);
    const zeilen = neueZeilen(s, t);
    expect(zeilen.some((z) => z.startsWith(`${formatDate(s)}: `) && z.includes('Kartellgewinn') && z.includes('8.000'))).toBe(true);
  });

  it('aufgeflogenes Doppelspiel und Preisdruck nach dem Rauswurf', () => {
    const b = withK3(balance, (k) => ({ ...k, konsortium: { ...k.konsortium, doubleDetect: 1 } }));
    const s = beigetreten('log-auf', 'ausspielen', b);
    const t = k3Round(s, b, texts);
    expect(neueZeilen(s, t).some((z) => z.includes(kapitel3NoteText(t, { round: 0, key: 'aufgeflogen' }, texts)))).toBe(true);
    const u = k3Round(t, b, texts);
    expect(u.cash).toBeLessThan(t.cash);
    // 0.4.20+9: Der Preisdruck hängt am Posted Price (expelledCost).
    const betrag = expelledCost(t, b).toLocaleString('de-DE');
    expect(neueZeilen(t, u).some((z) => z.includes('drückt Jacobs Preise') && z.includes(betrag))).toBe(true);
  });

  it('Projekt fertig oder gescheitert, Erträge – alles steht im Protokoll', () => {
    for (const risk of [0, 1]) {
      const b = withK3(balance, (k) => ({ ...k, projekte: { ...k.projekte, fraud: 0, memberRisk: 1, list: k.projekte.list.map((p) => ({ ...p, risk, minRank: 0, members: false })) } }));
      let s = k3Game(`log-proj-${risk}`, b);
      for (let i = 0; i < 10 && kapitel3Of(s, b)!.projekte.offers.length === 0; i++) s = k3Round(s, b, texts);
      const angebot = kapitel3Of(s, b)!.projekte.offers[0];
      expect(angebot).toBeDefined();
      s = ok(joinProject(s, b, angebot.id, b.kapitel3.projekte.shares[0]));
      const def = b.kapitel3.projekte.list.find((p) => p.id === angebot.id)!;
      const titel = texts.projekte.list[def.id].title.de;
      let alle: string[] = [];
      for (let i = 0; i < def.rounds + 2; i++) {
        const t = k3Round(s, b, texts);
        alle = alle.concat(neueZeilen(s, t));
        s = t;
      }
      if (risk === 0) {
        expect(alle.some((z) => z.includes('Fertig und in Betrieb') && z.includes(titel))).toBe(true);
        expect(alle.some((z) => z.includes('Erträge aus den Konsortialprojekten'))).toBe(true);
      } else {
        expect(alle.some((z) => z.includes('Gescheitert') && z.includes(titel))).toBe(true);
      }
    }
  });

  it('endRound reicht die Texte durch: die Zeilen stehen im Rundenbericht (roundLog)', () => {
    const s = beigetreten('log-end', 'annehmen');
    const t = endRound(s, balance, [], { kapitel3: texts });
    expect(roundLog(t).some((z) => z.includes('Kartellgewinn'))).toBe(true);
    // Ohne Texte (Bots, Werkzeuge) rechnet alles gleich, nur ohne Zeilen.
    const ohne = endRound(s, balance);
    expect(ohne.cash).toBe(t.cash);
    expect(roundLog(ohne).some((z) => z.includes('Kartellgewinn'))).toBe(false);
  });

  it('nur neue Notizen, jede einmal; Kapitel 1 schreibt nichts', () => {
    const s = beigetreten('log-einmal', 'annehmen');
    const t = advanceKapitel3(s, balance, texts);
    const neu = t.kapitel3!.notes.filter((n) => !s.kapitel3!.notes.includes(n));
    expect(neueZeilen(s, t)).toHaveLength(neu.length);
    expect(logKapitel3Notes(s, [], texts)).toBe(s);
    const k1 = { ...s, chapter: 1, kapitel3: undefined };
    expect(advanceKapitel3(k1, balance, texts)).toBe(k1);
  });
});
