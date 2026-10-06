// Geologe (GDD §5): Er schätzt die Fundchance, aber der Spieler sieht nie
// die wahre Zahl, sondern eine Bandbreite in Prozent ("35–60 %"). Wie breit
// sie ist, hängt an der Genauigkeit; wie schief sie liegt, an der Verzerrung.
// Die wahre Chance bleibt hier im Modul – der Spieler sieht sie nie.

import type { Balance, Geologist } from './balance';
import type { Parcel } from './geology';
import type { Rng } from './rng';
import { regionRichness } from './worldMap';

export type { Geologist };

/** Eine Schätzung des Geologen für eine Parzelle, in Prozent. */
export interface Forecast {
  parcelId: string;
  /** Untere Grenze der Bandbreite (gerundet). */
  low: number;
  /** Obere Grenze der Bandbreite (gerundet). */
  high: number;
  /** Mittelpunkt der Schätzung, ungerundet – nur für Auswertungen. */
  center: number;
  /** Startquelle (0.4.20+26): Öl sicher, das Band ist 100–100 %. */
  sure?: boolean;
}

/**
 * Öffentliches Wissen über die Zone (Etappe 1, zones.prior): was jeder über eine
 * Ranch in dieser Lage zum Salzdom weiß, ohne hinzusehen – die Ø Fundchance der Zone.
 */
export function zoneChance(balance: Balance, parcel: Pick<Parcel, 'zone'> & { region?: string }): number {
  const zone = balance.geology.zones.find((z) => z.name === parcel.zone);
  if (!zone) throw new Error(`Unbekannte Zone "${parcel.zone}".`);
  // 0.4.20+41: Dass ein Gebiet ergiebiger ist, weiß man – der Aufschlag gilt auch fürs öffentliche Wissen.
  const plus = parcel.region ? regionRichness(balance.world, parcel.region).chance : 0;
  return Math.min(0.95, Math.max(0.01, zone.prior + plus));
}

/**
 * Wahre Fundchance einer Parzelle: q aus Zone, Salzrücken und Rauschen (Etappe 1).
 * Ohne gespeichertes q (alter Spielstand) gilt das öffentliche Wissen der Zone (prior).
 * Nur für die Simulation und die Debug-Ansicht, nie für den Spieler.
 */
export function trueChance(balance: Balance, parcel: Pick<Parcel, 'zone' | 'chance'>): number {
  return parcel.chance ?? zoneChance(balance, parcel);
}

/**
 * Breite der Bandbreite in Prozentpunkten: Genauigkeit 1 bekommt widthMax,
 * Genauigkeit 5 bekommt widthMin, dazwischen gleichmäßig.
 */
export function forecastWidth(balance: Balance, accuracy: number): number {
  const { widthMin, widthMax } = balance.forecast;
  return widthMax - ((accuracy - 1) * (widthMax - widthMin)) / 4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Runde auf das Raster aus balance.yaml (z. B. 5 Prozentpunkte). */
function roundTo(value: number, step: number): number {
  return Math.round(Number((value / step).toFixed(6))) * step;
}

/**
 * Eine Prognose für eine Parzelle. Verbraucht genau einen Zufallswert: der
 * Geologe rät seine eigene Unschärfe, und zwar von Mal zu Mal anders.
 */
export function makeForecast(
  balance: Balance,
  parcel: Parcel,
  geologist: Geologist,
  rng: Rng,
  /** Wahre Chance (0–1), falls nicht die der Zone gilt, z. B. nach einer Bohrstufe. */
  chanceOverride?: number,
): Forecast {
  const width = forecastWidth(balance, geologist.accuracy);
  const chance = 100 * (chanceOverride ?? trueChance(balance, parcel));
  const error = (rng.float() * 2 - 1) * width;
  return forecastAround(balance, parcel.id, chance + geologist.bias + error, width);
}

/**
 * Spielspaß K1 (Tieferbohren): Prognose für die nächste Bohrstufe nach einer trockenen
 * (forecast.deeper). Der Fehler ist relativ zur Chance, die Mitte im Schnitt also genau
 * die Chance – ehrlich auch bei kleinen Werten. Die Verzerrung des Geologen bleibt.
 * Verbraucht genau einen Zufallswert, wie makeForecast.
 */
export function makeDeeperForecast(balance: Balance, parcelId: string, geologist: Geologist, rng: Rng, chance: number): Forecast {
  const d = balance.forecast.deeper;
  const mitte = Math.max(0, 100 * chance * (1 + (rng.float() * 2 - 1) * d.error) + geologist.bias);
  return forecastAround(balance, parcelId, mitte, mitte * d.width, d.rounding);
}

/**
 * Bandbreite um eine Mitte (in Prozent) mit der Breite width, auf das Raster aus
 * balance.yaml gerundet und auf 0–100 begrenzt. Kein Zufall.
 */
export function forecastAround(balance: Balance, parcelId: string, center: number, width: number, rounding = balance.forecast.rounding): Forecast {
  let low = clamp(roundTo(clamp(center - width / 2, 0, 100), rounding), 0, 100);
  let high = clamp(roundTo(clamp(center + width / 2, 0, 100), rounding), 0, 100);
  // An den Grenzen kann das Raster die Bandbreite zusammendrücken.
  if (low === high) {
    if (low + rounding <= 100) high = low + rounding;
    else low = high - rounding;
  }
  return { parcelId, low, high, center };
}

/** Prognosen für alle pachtbaren Parzellen, in der Reihenfolge der Liste. */
export function makeForecasts(
  balance: Balance,
  parcels: readonly Parcel[],
  geologist: Geologist,
  rng: Rng,
): Record<string, Forecast> {
  const forecasts: Record<string, Forecast> = {};
  for (const parcel of parcels) {
    if (parcel.discovery) continue;
    forecasts[parcel.id] = makeForecast(balance, parcel, geologist, rng);
  }
  return forecasts;
}

/** Mitte der angezeigten Bandbreite in Prozent – das, was der Spieler abliest. */
export function forecastMid(forecast: Pick<Forecast, 'low' | 'high'>): number {
  return (forecast.low + forecast.high) / 2;
}

/** Kurzform für die Anzeige, z. B. "35–60 % Fundchance". */
export function formatForecast(forecast: Forecast): string {
  if (forecast.sure) return 'Öl sicher';
  return `${forecast.low}–${forecast.high} % Fundchance`;
}