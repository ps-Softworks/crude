// Delgados Produzentenverband (4.10, GDD §9.2, §13 Kapitel 2): Rosa Delgado gründet
// guild.foundDelay Runden nach Kapitelbeginn den Verband der Unabhängigen. Gemeinsam
// verhandeln sie gegen den Posted Price des Trusts:
//   Mitglied → premium · Stärke $ je Barrel mehr (Stärke = Mitglieder / fullMembers, höchstens 1),
//   dafür je Runde dues $ Beitrag.
// Je Runde kommt mit growChance ein Mitglied dazu (mit Jacob zwei); führt Pruett den
// Trust, laufen manchmal welche weg.
// „Verbündete gegen den Trust – bis der Spieler selbst der Trust ist“: Ab einem
// Imperiumswert von tooBigValue stellt Delgado Jacob zur Rede (Merkzeichen
// k2_verband_zu_gross, Ereignis). Austritt ohne Groll oder Ausschluss im Streit.
// Wer zu groß ist und nicht (mehr) im Verband, pachtet bei Unabhängigen teurer.

import { spendAppointments } from './agenda';
import type { Balance } from './balance';
import { formatDate } from './calendar';
import { changeRelation, DIPLO_MARKS, hasDiplomacy, remember, setMark, type DiploGame, type DiploReason, type DiploResult, type GuildState } from './diplomacyCore';
import { refreshEffects, tooBig } from './diplomacyEffects';
import type { GameState } from './game';
import type { Rng } from './rng';

export function newGuild(): GuildState {
  return { founded: 0, members: 0, member: false, joinedRound: 0, expelled: false, warned: 0 };
}

/** Jacob tritt bei (aus dem Ereignis oder am Schreibtisch). */
export function enterGuild(state: DiploGame, round: number): DiploGame {
  const d = state.diplomacy;
  const neu = remember(changeRelation(d, 'delgado', { trust: 10 }), 'delgado', 'gefallen', round);
  return {
    ...state,
    diplomacy: { ...neu, guild: { ...d.guild, member: true, joinedRound: round, members: d.guild.members + 1 } },
    log: [...state.log, `${formatDate(state)}: Jacob tritt Rosa Delgados Produzentenverband bei.`],
  };
}

/**
 * Jacob verlässt den Verband: „austritt“ am Schreibtisch (Delgado traut ihm weniger),
 * „imGuten“ nach Delgados Vorwurf (ohne Folgen), „streit“ = Ausschluss (Groll + fightGrudge).
 */
export type GuildExit = 'austritt' | 'imGuten' | 'streit';

export function exitGuild(state: DiploGame, balance: Balance, mode: GuildExit): DiploGame {
  const g = balance.diplomacy.guild;
  const d0 = state.diplomacy;
  const d =
    mode === 'streit'
      ? changeRelation(d0, 'delgado', { grudge: g.fightGrudge })
      : mode === 'austritt'
        ? changeRelation(d0, 'delgado', { trust: -g.leaveTrust })
        : d0;
  const text =
    mode === 'streit'
      ? `${formatDate(state)}: Rosa Delgado schließt Jacob aus dem Produzentenverband aus.`
      : `${formatDate(state)}: Jacob tritt aus dem Produzentenverband aus.`;
  const streit = mode === 'streit';
  return {
    ...state,
    diplomacy: { ...d, guild: { ...d0.guild, member: false, expelled: d0.guild.expelled || streit, members: Math.max(0, d0.guild.members - (d0.guild.member ? 1 : 0)) } },
    log: [...state.log, text],
  };
}

export function joinReason(state: GameState): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  const g = state.diplomacy.guild;
  if (g.founded === 0) return 'nicht_gegruendet';
  if (g.expelled) return 'ausgeschlossen';
  if (g.member) return 'mitglied';
  return null;
}

/** Beitreten am Schreibtisch: ein Termin bei Delgado. */
export function joinGuild(state: GameState, balance: Balance): DiploResult {
  const reason = joinReason(state);
  if (reason) return { ok: false, reason };
  const zeit = spendAppointments(state, balance, 1);
  if (!zeit.ok) return { ok: false, reason: 'zeit' };
  return { ok: true, state: refreshEffects(enterGuild(zeit.state as DiploGame, state.round), balance, state.round) };
}

export function leaveReason(state: GameState): DiploReason | null {
  if (!hasDiplomacy(state)) return 'inaktiv';
  if (state.finished) return 'ende';
  return state.diplomacy.guild.member ? null : 'kein_mitglied';
}

/** Austreten (ohne Termin, ein Brief genügt): Delgado traut Jacob weniger. */
export function leaveGuild(state: GameState, balance: Balance): DiploResult {
  const reason = leaveReason(state);
  if (reason) return { ok: false, reason };
  return { ok: true, state: refreshEffects(exitGuild(state as DiploGame, balance, 'austritt'), balance, state.round) };
}

/**
 * Am Rundenende: Gründung (Merkzeichen k2_verband_gegruendet), Wachstum (ein
 * Zufallswert je Runde nach der Gründung), Beitrag, und ob Jacob zu groß geworden ist.
 */
export function advanceGuild(state: DiploGame, balance: Balance, rng: Rng): DiploGame {
  const b = balance.diplomacy.guild;
  const date = formatDate(state);
  let out = state;
  let g = out.diplomacy.guild;
  if (g.founded === 0) {
    if (state.round < out.diplomacy.startRound + b.foundDelay) return out;
    g = { ...g, founded: state.round, members: b.startMembers };
    out = setMark(
      { ...out, diplomacy: { ...out.diplomacy, guild: g }, log: [...out.log, `${date}: Rosa Delgado gründet den Verband unabhängiger Produzenten.`] },
      DIPLO_MARKS.guildFounded,
    );
    return out;
  }
  const z = rng.float();
  let members = g.members;
  if (z < b.growChance) members += g.member ? 2 : 1;
  else if (out.diplomacy.succession.outcome === 'pruett' && z > 1 - b.growChance / 2) members = Math.max(1, members - 1);
  g = { ...g, members };
  let cash = out.cash;
  const log = [...out.log];
  if (g.member && b.dues > 0) {
    cash -= b.dues;
    log.push(`${date}: Beitrag an den Produzentenverband: ${b.dues.toLocaleString('de-DE')} $.`);
  }
  out = { ...out, cash, log, diplomacy: { ...out.diplomacy, guild: g } };
  if (g.member && g.warned === 0 && tooBig(out, balance)) {
    out = setMark(
      { ...out, diplomacy: { ...out.diplomacy, guild: { ...g, warned: state.round } }, log: [...out.log, `${date}: Im Verband wird getuschelt: Harlan Oil sei selbst schon ein kleiner Trust.`] },
      DIPLO_MARKS.guildTooBig,
    );
  }
  return out;
}
