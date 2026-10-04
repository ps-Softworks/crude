// Konsortialprojekte (4.17, GDD §13 Kapitel 3, §8 „Farm-out / Joint Venture“,
// §9.4 „Joint Venture: Kosten und Risiko teilen“): Vorhaben, die für eine Firma
// allein zu groß sind – Fernpipeline, Großraffinerie, Tanklager, eine Konzession
// in Costa Negra. Mehrere Firmen legen zusammen; Jacob zeichnet einen Anteil.
//
// Ablauf: Alle offerEvery Runden kommt ein Angebot (jedes Projekt nur einmal),
// das offerRounds Runden liegt. Wer zeichnet, zahlt Anteil × Kosten sofort. Das
// Projekt baut rounds Runden; in jeder Baurunde kann ein Partner betrügen (eine
// Runde Verzögerung). Zum Schluss entscheidet das Risiko: Es läuft – dann zahlt
// es Anteil × Ertrag je Runde – oder es scheitert, und das Geld ist weg.
// Türen: minRank verlangt Stand in Hallstead (stand.ts), members nur fürs
// Konsortium (konsortium.ts). Mitglieder tragen weniger Risiko (memberRisk).

import type { Balance } from './balance';
import type { ProjectBalance } from './kapitel3Balance';
import type { GameState } from './game';
import { begin, note, withRng, type Kapitel3Reason, type Kapitel3Result, type Kapitel3State, type ProjectStake } from './kapitel3';
import { isMember } from './konsortium';
import { standRank } from './stand';

export function projectDef(balance: Balance, id: string): ProjectBalance | undefined {
  return balance.kapitel3.projekte.list.find((p) => p.id === id);
}

/** Risiko, dass das fertige Projekt scheitert – für Mitglieder kleiner. */
export function projectRisk(k3: Kapitel3State, balance: Balance, def: ProjectBalance): number {
  return Math.min(1, def.risk * (isMember(k3) ? balance.kapitel3.projekte.memberRisk : 1));
}

/** Probelauf fürs Zeichnen: null = geht. */
export function joinBlocker(state: GameState, balance: Balance, k3: Kapitel3State, offerId: string, share: number): Kapitel3Reason | null {
  const offer = k3.projekte.offers.find((o) => o.id === offerId);
  const def = projectDef(balance, offerId);
  if (!offer || !def || state.round > offer.until) return 'kein_angebot';
  if (!balance.kapitel3.projekte.shares.includes(share)) return 'anteil';
  if (def.members && !isMember(k3)) return 'nur_mitglieder';
  if (standRank(k3, balance) < def.minRank) return 'rang';
  if (state.cash < share * def.cost) return 'geld';
  return null;
}

export function joinProject(input: GameState, balance: Balance, offerId: string, share: number): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  const sperre = joinBlocker(state, balance, k3, offerId, share);
  if (sperre) return { ok: false, reason: sperre };
  const def = projectDef(balance, offerId)!;
  const paid = Math.round(share * def.cost);
  const stake: ProjectStake = { id: def.id, share, paid, joinedRound: state.round, readyRound: state.round + def.rounds, status: 'bau', earned: 0 };
  const k = note(
    { ...k3, projekte: { ...k3.projekte, offers: k3.projekte.offers.filter((o) => o.id !== offerId), stakes: [...k3.projekte.stakes, stake] } },
    { round: state.round, key: 'projekt_gezeichnet', vars: { projekt: def.id, betrag: paid } },
  );
  return { ok: true, state: { ...state, cash: state.cash - paid, kapitel3: k } };
}

export function declineProject(input: GameState, balance: Balance, offerId: string): Kapitel3Result {
  const b = begin(input, balance);
  if (!b.ok) return b;
  const { state, k3 } = b;
  if (!k3.projekte.offers.some((o) => o.id === offerId)) return { ok: false, reason: 'kein_angebot' };
  return { ok: true, state: { ...state, kapitel3: { ...k3, projekte: { ...k3.projekte, offers: k3.projekte.offers.filter((o) => o.id !== offerId) } } } };
}

/**
 * Rundenende: Bau (Betrug, Fertigstellung, Scheitern), Erträge, verfallene und
 * neue Angebote. Je Baurunde ein Würfel für Betrug, bei Fertigstellung einer fürs Risiko.
 */
export function settleProjekte(state: GameState, balance: Balance, input: Kapitel3State): [Kapitel3State, number] {
  const pb = balance.kapitel3.projekte;
  const r = state.round;
  const next = r + 1;
  let k = input;
  let cash = 0;

  // Erträge der laufenden Projekte (was gerade erst fertig wird, zahlt ab der nächsten Runde).
  let ertrag = 0;
  const stakes: ProjectStake[] = [];
  for (const s of k.projekte.stakes) {
    const def = projectDef(balance, s.id);
    if (s.status === 'laeuft' && def) {
      const income = Math.round(s.share * def.income);
      ertrag += income;
      stakes.push({ ...s, earned: s.earned + income });
    } else stakes.push(s);
  }
  k = { ...k, projekte: { ...k.projekte, stakes } };
  if (ertrag > 0) {
    cash += ertrag;
    k = note(k, { round: r, key: 'projekt_ertrag', vars: { betrag: ertrag } });
  }

  // Bau.
  for (let i = 0; i < k.projekte.stakes.length; i++) {
    const s = k.projekte.stakes[i];
    const def = projectDef(balance, s.id);
    if (s.status !== 'bau' || !def) continue;
    const [betrug, k2] = withRng(k, (rng) => rng.float() < pb.fraud);
    k = k2;
    let stake = s;
    if (betrug) {
      stake = { ...stake, readyRound: stake.readyRound + 1 };
      k = note(k, { round: r, key: 'projekt_verzoegert', vars: { projekt: s.id } });
    }
    if (stake.readyRound <= next) {
      const risk = projectRisk(k, balance, def);
      const [scheitert, k3] = withRng(k, (rng) => rng.float() < risk);
      k = k3;
      stake = { ...stake, status: scheitert ? 'gescheitert' : 'laeuft' };
      k = note(k, { round: r, key: scheitert ? 'projekt_gescheitert' : 'projekt_fertig', vars: { projekt: s.id, betrag: stake.paid } });
    }
    const list = [...k.projekte.stakes];
    list[i] = stake;
    k = { ...k, projekte: { ...k.projekte, stakes: list } };
  }

  // Angebote verfallen.
  const verfallen = k.projekte.offers.filter((o) => o.until < next);
  if (verfallen.length > 0) {
    k = { ...k, projekte: { ...k.projekte, offers: k.projekte.offers.filter((o) => o.until >= next) } };
    for (const o of verfallen) k = note(k, { round: r, key: 'projekt_verfallen', vars: { projekt: o.id } });
  }

  // Neues Angebot zur nächsten Runde.
  if (k.projekte.offers.length < pb.maxOffers && next - k.projekte.lastOfferRound >= pb.offerEvery) {
    const kandidaten = pb.list.filter((p) => !k.projekte.seen.includes(p.id) && (!p.members || isMember(k)));
    if (kandidaten.length > 0) {
      const [def, k2] = withRng(k, (rng) => rng.pick(kandidaten));
      k = note(
        {
          ...k2,
          projekte: {
            ...k2.projekte,
            offers: [...k2.projekte.offers, { id: def.id, round: next, until: next + pb.offerRounds - 1 }],
            seen: [...k2.projekte.seen, def.id],
            lastOfferRound: next,
          },
        },
        { round: next, key: 'projekt_angebot', vars: { projekt: def.id } },
      );
    }
  }
  return [k, cash];
}

/** Buchwert der Beteiligungen (eingezahlt, ohne gescheiterte) – für den Imperiumswert (Integrationsfrage). */
export function projectsValue(state: GameState): number {
  return (state.kapitel3?.projekte.stakes ?? []).filter((s) => s.status !== 'gescheitert').reduce((sum, s) => sum + s.paid, 0);
}
