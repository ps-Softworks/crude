// Texte für Kapitel 3 (4.17) aus content/kapitel3.yaml und kleine Helfer, die
// Notizen und Gründe lesbar machen. Keine Spielregeln hier.
import kapitel3Text from '../../content/kapitel3.yaml?raw';
import type { GameState } from '../sim/game';
import { localize, type LocalizedText } from '../sim/i18n';
import type { Kapitel3Note, Kapitel3Reason, SeismikReport } from '../sim/kapitel3';
import { fillText, parseKapitel3Content, type Kapitel3Content } from '../sim/kapitel3Content';
import { parcelLabel } from '../sim/lease';
import { balance } from './balance';
import { money } from './format';

function laden(): Kapitel3Content {
  const { content, errors } = parseKapitel3Content('content/kapitel3.yaml', kapitel3Text);
  if (!content) throw new Error(errors.map((e) => `${e.file}:${e.line} ${e.message}`).join('\n'));
  return content;
}

export const k3 = laden();

/** Text in der Spielsprache. */
export function t(text: LocalizedText): string {
  return localize(text);
}

export function reasonText(reason: Kapitel3Reason): string {
  return t(k3.reasons[reason]);
}

function ranchName(game: GameState, id: string): string {
  const p = game.parcels.find((x) => x.id === id);
  return p ? parcelLabel(p) : id;
}

/** Notiz mit eingesetzten Namen und Beträgen. */
export function noteText(game: GameState, n: Kapitel3Note): string {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(n.vars ?? {})) {
    if (key === 'betrag') vars[key] = money(Number(value));
    else if (key === 'ranch') vars[key] = ranchName(game, String(value));
    else if (key === 'gefallen') vars[key] = k3.konsortium.favors[String(value)] ? t(k3.konsortium.favors[String(value)].title) : String(value);
    else if (key === 'projekt') vars[key] = k3.projekte.list[String(value)] ? t(k3.projekte.list[String(value)].title) : String(value);
    else vars[key] = String(value);
  }
  return fillText(k3.notes[n.key], vars);
}

/** „Fundchance 60–70 % · Falle mittel bis groß“ – Seismik-Bericht in einer Zeile. */
export function reportText(r: SeismikReport): string {
  const sizes = balance.kapitel3.seismik.sizeClasses;
  const name = (i: number) => t(k3.seismik.sizes[sizes[i].id]);
  const falle =
    r.sizeLow === null || r.sizeHigh === null
      ? t(k3.seismik.none)
      : r.sizeLow === r.sizeHigh
        ? fillText(k3.seismik.trap, { size: name(r.sizeLow) })
        : fillText(k3.seismik.trapRange, { from: name(r.sizeLow), to: name(r.sizeHigh) });
  return `${fillText(k3.seismik.chance, { low: String(r.low), high: String(r.high) })} · ${falle}`;
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
