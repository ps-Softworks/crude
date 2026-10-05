// Fenster „Vertrieb“ (4.14): Marke und Tankstellen ab Kapitel 3 (GDD §6).
// Vor der Gründung ein Brief des Vertriebschefs mit Namensvorschlägen, danach
// drei Reiter: Netz (Tankstellen, Anteil, Bekanntheit, Preis je Region), Werbung
// und Crane (Margaret Cranes Marke). Keine Spielregeln hier – jede Zahl kommt aus
// src/sim/brand.ts, jeder Text aus content/brand.yaml.

import { useState } from 'react';
import {
  awarenessWord,
  brandAntitrust,
  brandGoal,
  brandOf,
  brandRegionOpen,
  brandUnlocked,
  brandValue,
  brandWorldFrom,
  buildingCount,
  buildStations,
  foundBrand,
  nationalShare,
  PRICE_POLICIES,
  sellStation,
  setPricePolicy,
  startCampaign,
  stationCost,
  type BrandResult,
  regionPresent,
} from '../../sim/brand';
import { brandNewsText, brandText, campaignName, regionName } from '../../sim/brandContent';
import type { GameState } from '../../sim/game';
import { localize } from '../../sim/i18n';
import { balance } from '../balance';
import { RATINGS } from '../../sim/balance';
import { brandContent as C } from '../brand';
import { money, percent } from '../format';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';
import './brand.css';

const t = (key: keyof typeof C.ui, values?: Record<string, string | number>) => brandText(C.ui[key], values);

export const BRAND_TABS = [
  { id: 'netz', label: localize(C.ui.tabNetwork) },
  { id: 'werbung', label: localize(C.ui.tabAds) },
  { id: 'crane', label: localize(C.ui.tabCrane) },
];

/** Ein Knopf für eine Aktion der Marke: gesperrt mit Begründung, wenn sie nicht geht. */
function Aktion({ result, onDone, children, className }: { result: BrandResult<GameState>; onDone: (s: GameState) => void; children: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      disabled={!result.ok}
      title={result.ok ? undefined : localize(C.refusals[result.reason])}
      onClick={() => result.ok && onDone(result.state)}
    >
      {children}
    </button>
  );
}

/**
 * Neu-Hinweis am Gegenstand: Hat die letzte Abrechnung (oder ein Skandal während der
 * Runde) Meldungen gebracht – Preiskampf, Cranes Ausbau, auslaufende Werbung –, zeigt
 * der Gegenstand „n neu“. null vor Kapitel 3 und ohne Meldungen.
 */
export function brandDeskBadge(game: GameState): { text: string } | null {
  if (!brandUnlocked(brandWorldFrom(game), balance) || !game.brand) return null;
  const n = game.brand.news.length;
  return n > 0 ? { text: t('newsBadge', { anzahl: n }) } : null;
}

/** Kurzform für das Schild am Gegenstand, z. B. „12 Tankstellen · 9 %“; null vor Kapitel 3. */
export function brandDeskStatus(game: GameState): string | null {
  const world = brandWorldFrom(game);
  if (!brandUnlocked(world, balance)) return null;
  const brand = brandOf(game, balance);
  if (!brand.founded) return localize(C.ui.deskNoBrand);
  const stationen = Object.values(brand.regions).reduce((s, r) => s + r.stations, 0);
  return `${stationen} ${localize(C.ui.stations)} · ${percent(nationalShare(brand).jacob)}`;
}

function Gruendung({ ctx }: { ctx: SheetContext }) {
  const world = brandWorldFrom(ctx.game);
  const ids = Object.keys(C.names);
  const [name, setName] = useState(ids[0]);
  return (
    <div className="marke-brief">
      <h3>{localize(C.intro.title)}</h3>
      <p className="marke-brieftext">{localize(C.intro.text)}</p>
      <fieldset className="marke-namen">
        <legend>{localize(C.intro.choose)}</legend>
        {ids.map((id) => (
          <label key={id}>
            <input type="radio" name="markenname" value={id} checked={name === id} onChange={() => setName(id)} /> {localize(C.names[id])}
          </label>
        ))}
      </fieldset>
      <div className="actions zeile">
        <Aktion result={foundBrand(ctx.game, balance, world, name, localize(C.names[name]))} onDone={ctx.onGame}>
          {brandText(C.intro.found, { kosten: money(balance.brand.foundCost) })}
        </Aktion>
      </div>
    </div>
  );
}

function Netz({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const world = brandWorldFrom(game);
  const brand = brandOf(game, balance);
  const ziel = brandGoal(brand, balance);
  const kartell = brandAntitrust(brand, balance);
  const st = balance.brand.station;
  return (
    <>
      <section className="marke-bericht">
        <h3>{t('news')}</h3>
        {brand.news.length === 0 ? (
          <p className="klein">{t('noNews')}</p>
        ) : (
          <ul>
            {brand.news.map((n, i) => (
              <li key={i}>{brandNewsText(C, n)}</li>
            ))}
          </ul>
        )}
      </section>
      <p className="marke-kennzahlen">
        <span>{t('national', { anteil: percent(nationalShare(brand).jacob) })}</span>
        <span>{t('profit', { betrag: money(brand.lastProfit) })}</span>
        <span>{t('value', { betrag: money(brandValue(brand, balance, world)) })}</span>
      </p>
      <p className="klein">
        {t('goal', {
          regionAnteil: percent(balance.brand.goal.presenceShare),
          soll: balance.brand.goal.regions,
          ist: ziel.regions,
          anteilSoll: percent(balance.brand.goal.share),
          anteilIst: percent(ziel.share),
        })}
        {ziel.reached && ' ✓'}
        <br />
        {/* Die Kapitelprüfung verlangt dazu ein Rating (0.4.19+2) – sonst sähe „✓“ wie „bestanden“ aus. */}
        {t('goalRating', { ist: game.rating, soll: balance.chapter.chapter3.minRating })}
        {RATINGS.indexOf(game.rating) <= RATINGS.indexOf(balance.chapter.chapter3.minRating) ? ' ✓' : ' ✗'}
      </p>
      {(kartell.regions.length > 0 || kartell.national) && <p className="hint">{t('antitrust')}</p>}
      <table className="marke-tabelle">
        <thead>
          <tr>
            <th scope="col">{t('region')}</th>
            <th scope="col">{t('stations')}</th>
            <th scope="col">{t('share')}</th>
            <th scope="col">{t('awareness')}</th>
            <th scope="col">{t('price')}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {balance.brand.regions.map((rb) => {
            const r = brand.regions[rb.id];
            const name = regionName(C, rb.id);
            if (!r || !brandRegionOpen(world, balance, rb.id)) {
              return (
                <tr key={rb.id} className="zu">
                  <th scope="row">{name}</th>
                  <td colSpan={5} className="klein">
                    {t('closed')}
                  </td>
                </tr>
              );
            }
            const imBau = buildingCount(brand, rb.id);
            const kosten = stationCost(balance, rb.id);
            const krieg = r.last?.priceWar ?? false;
            return (
              <tr key={rb.id}>
                <th scope="row">{name}</th>
                <td>
                  {r.stations}
                  {imBau > 0 && <span className="klein"> ({t('building', { anzahl: imBau })})</span>}
                </td>
                <td>
                  {r.last ? percent(r.last.share) : '–'}
                  {/* 0.4.20+6: Region zählt fürs Kapitelziel (Marktanteil ≥ brand.goal.presenceShare). */}
                  {regionPresent(r, balance) && <span title="zählt fürs Kapitelziel"> ✓</span>}
                </td>
                <td>{localize(C.words[awarenessWord(r.awareness)])}</td>
                <td>
                  <span className="marke-preise" role="group" aria-label={`${t('price')} ${name}`}>
                    {PRICE_POLICIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={r.price === p}
                        className={r.price === p ? 'gewaehlt' : undefined}
                        disabled={r.price === p || r.stations + imBau === 0}
                        onClick={() => {
                          const res = setPricePolicy(game, balance, world, rb.id, p);
                          if (res.ok) ctx.onGame(res.state);
                        }}
                      >
                        {localize(C.prices[p])}
                      </button>
                    ))}
                  </span>
                  {krieg && <span className="marke-krieg"> {t('priceWar')}</span>}
                </td>
                <td className="marke-aktionen">
                  <Aktion result={buildStations(game, balance, world, rb.id, 1)} onDone={ctx.onGame}>
                    {t('build', { anzahl: 1, kosten: money(kosten) })}
                  </Aktion>
                  <Aktion result={buildStations(game, balance, world, rb.id, st.buildMax)} onDone={ctx.onGame}>
                    {t('build', { anzahl: st.buildMax, kosten: money(kosten * st.buildMax) })}
                  </Aktion>
                  {r.stations > 0 && (
                    <Aktion result={sellStation(game, balance, world, rb.id)} onDone={ctx.onGame}>
                      {t('sell', { kosten: money(kosten * st.resale) })}
                    </Aktion>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Werbung({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const world = brandWorldFrom(game);
  const brand = brandOf(game, balance);
  const offen = balance.brand.regions.filter((rb) => brandRegionOpen(world, balance, rb.id));
  return (
    <div className="marke-werbung">
      {balance.brand.campaigns.map((c) => (
        <section key={c.id}>
          <h3>{campaignName(C, c.id)}</h3>
          <p className="klein">{C.campaigns[c.id] ? localize(C.campaigns[c.id].text) : ''}</p>
          <div className="actions zeile">
            {offen.map((rb) => {
              const laeuft = brand.regions[rb.id]?.campaigns.find((k) => k.kind === c.id && k.until >= game.round);
              return laeuft ? (
                <span key={rb.id} className="klein marke-laeuft">
                  {t('campaignRun', { kampagne: `${campaignName(C, c.id)} (${regionName(C, rb.id)})`, runde: laeuft.until })}
                </span>
              ) : (
                <Aktion key={rb.id} result={startCampaign(game, balance, world, rb.id, c.id)} onDone={ctx.onGame}>
                  {t('campaignStart', { kampagne: campaignName(C, c.id), region: regionName(C, rb.id), kosten: money(c.cost) })}
                </Aktion>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Crane({ ctx }: { ctx: SheetContext }) {
  const world = brandWorldFrom(ctx.game);
  const brand = brandOf(ctx.game, balance);
  return (
    <>
      <p className="marke-brieftext">{t('craneIntro')}</p>
      <p>{t('national', { anteil: percent(nationalShare(brand).crane) })}</p>
      <ul className="pinnwand-liste">
        {balance.brand.regions
          .filter((rb) => brandRegionOpen(world, balance, rb.id))
          .map((rb) => {
            const c = brand.regions[rb.id].crane;
            return (
              <li key={rb.id}>
                {t('craneRow', {
                  region: regionName(C, rb.id),
                  anzahl: c.stations,
                  wort: localize(C.words[awarenessWord(c.awareness)]),
                  preis: localize(C.prices[c.price]),
                })}
                {c.warRounds > 0 && <span className="marke-krieg"> {t('priceWar')}</span>}
              </li>
            );
          })}
      </ul>
    </>
  );
}

export function BrandSheet({ ctx }: { ctx: SheetContext }) {
  const world = brandWorldFrom(ctx.game);
  if (!brandUnlocked(world, balance)) return <p>{localize(C.refusals.locked)}</p>;
  const brand = brandOf(ctx.game, balance);
  if (!brand.founded) return <Gruendung ctx={ctx} />;
  const tab = activeTab('marke', BRAND_TABS, ctx.tab);
  return (
    <Tabs sheet="marke" tabs={BRAND_TABS} active={tab} onChange={ctx.onTab}>
      {tab === 'netz' && <Netz ctx={ctx} />}
      {tab === 'werbung' && <Werbung ctx={ctx} />}
      {tab === 'crane' && <Crane ctx={ctx} />}
    </Tabs>
  );
}
