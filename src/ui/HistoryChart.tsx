// Diagramme zum Verlauf (0.4.20+42): SVG-Linien wie Tusche auf Papier, ohne Bibliothek.
// Liest nur die Verlaufseinträge (src/sim/history.ts); keine Spielregeln hier.

import type { HistoryEntry } from '../sim/history';
import { NBSP } from './format';

export interface ChartSeries {
  /** Name für Legende und Screenreader. */
  label: string;
  /** Wert je Eintrag. */
  value: (e: HistoryEntry) => number;
  /** CSS-Klasse der Linie (tinte | rot | ocker | blau). */
  tone?: 'tinte' | 'rot' | 'ocker' | 'blau';
}

const W = 320;
const H = 112;
const RAND = { l: 44, r: 8, t: 8, b: 18 };

/** Kurze Achsenzahl: 1.200 → „1,2k“, 2.500.000 → „2,5M“. */
export function axisNumber(v: number, decimals = 0): string {
  const a = Math.abs(v);
  const vz = v < 0 ? '−' : '';
  const kurz = (x: number, unit: string) => `${vz}${(x).toLocaleString('de-DE', { maximumFractionDigits: 1 })}${unit}`;
  if (a >= 1_000_000) return kurz(a / 1_000_000, 'M');
  if (a >= 10_000) return kurz(a / 1000, 'k');
  if (a >= 1000) return kurz(a / 1000, 'k');
  return `${vz}${a.toLocaleString('de-DE', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;
}

/** Eine kleine Tabelle der Skala: runde Zwischenwerte zwischen lo und hi. */
function ticks(lo: number, hi: number): number[] {
  const n = 3;
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

export function HistoryChart({
  title,
  history,
  series,
  decimals = 0,
  unit = '',
  compact = false,
}: {
  title: string;
  history: readonly HistoryEntry[];
  series: ChartSeries[];
  decimals?: number;
  unit?: string;
  /** Kleinere Fassung (Kapitelbildschirm). */
  compact?: boolean;
}) {
  if (history.length < 2) {
    return (
      <figure className="verlauf-bild">
        <figcaption>{title}</figcaption>
        <p className="muted klein">Noch zu wenig Runden für ein Diagramm.</p>
      </figure>
    );
  }
  const alle = series.flatMap((s) => history.map(s.value));
  let lo = Math.min(...alle);
  let hi = Math.max(...alle);
  if (lo > 0 && lo < hi * 0.5) lo = 0;
  if (hi === lo) hi = lo + 1;
  const first = history[0].r;
  const last = history[history.length - 1].r;
  const x = (r: number) => RAND.l + ((r - first) / Math.max(1, last - first)) * (W - RAND.l - RAND.r);
  const y = (v: number) => H - RAND.b - ((v - lo) / (hi - lo)) * (H - RAND.b - RAND.t);
  const kapitelWechsel = history.filter((e, i) => i > 0 && e.k !== history[i - 1].k);
  const beschreibung = `${title}: ${series
    .map((s) => `${s.label} von ${axisNumber(s.value(history[0]), decimals)} auf ${axisNumber(s.value(history[history.length - 1]), decimals)}`)
    .join(', ')}${unit ? NBSP + unit : ''}, Runde ${first} bis ${last}.`;
  return (
    <figure className={`verlauf-bild${compact ? ' kompakt' : ''}`}>
      <figcaption>
        {title}
        {series.length > 1 && (
          <span className="verlauf-legende">
            {series.map((s) => (
              <span key={s.label} className={`ton-${s.tone ?? 'tinte'}`}>
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={beschreibung} preserveAspectRatio="xMidYMid meet">
        {ticks(lo, hi).map((t) => (
          <g key={t}>
            <line x1={RAND.l} x2={W - RAND.r} y1={y(t)} y2={y(t)} className="gitter" />
            <text x={RAND.l - 4} y={y(t) + 3} textAnchor="end" className="achse">
              {axisNumber(t, decimals)}
            </text>
          </g>
        ))}
        {lo < 0 && hi > 0 && <line x1={RAND.l} x2={W - RAND.r} y1={y(0)} y2={y(0)} className="nulllinie" />}
        {kapitelWechsel.map((e) => (
          <g key={e.r}>
            <line x1={x(e.r)} x2={x(e.r)} y1={RAND.t} y2={H - RAND.b} className="kapitellinie" />
            <text x={x(e.r) + 3} y={RAND.t + 8} className="achse">
              Kap. {e.k}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            className={`linie ton-${s.tone ?? 'tinte'}`}
            fill="none"
            points={history.map((e) => `${x(e.r).toFixed(1)},${y(s.value(e)).toFixed(1)}`).join(' ')}
          />
        ))}
        <text x={RAND.l} y={H - 4} className="achse">
          Runde {first}
        </text>
        <text x={W - RAND.r} y={H - 4} textAnchor="end" className="achse">
          {last}
        </text>
      </svg>
    </figure>
  );
}
