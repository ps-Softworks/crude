// Fenster „Hallstead-Mappe“ (4.16, ab Kapitel 3): Beteiligungen außerhalb von Öl,
// der Lobbyist in der Hauptstadt und die Gesetze, auf die er Druck machen kann.
// Oben das Telegramm des letzten Rundenendes. Alle Sätze kommen fertig aus
// src/sim/hallsteadContent.ts (hallsteadView), alle Regeln aus holdings.ts und lobby.ts.
// Dazu der Gegenstand auf dem Schreibtisch (HallsteadDeskItem) – in Kapitel 1 unsichtbar.

import { useState } from 'react';
import type { GameState } from '../../sim/game';
import { PARTY_IDS } from '../../sim/hallsteadBalance';
import { fillText, hallsteadView } from '../../sim/hallsteadContent';
import { debugUnlockHallstead, hallsteadUnlocked, type HallsteadResult } from '../../sim/hallsteadState';
import { buyHolding, runCampaign, sellHolding } from '../../sim/holdings';
import { bribe, donate, fireLobbyist, hireLobbyist, pushLaw, waterDownLaw } from '../../sim/lobby';
import { localize } from '../../sim/i18n';
import { balance } from '../balance';
import { money } from '../format';
import { hallsteadContent as C } from '../hallstead';
import { DeskObject, type Placement } from '../scene/DeskObject';
import { activeTab, Tabs, type TabDef } from '../sheet/Tabs';
import type { SheetContext } from './types';
import './hallstead.css';

const L = localize;

/** Liegt die Mappe auf dem Tisch? Ab Kapitel 3 – im Debug immer, damit man sie ausprobieren kann. */
export function hallsteadOnDesk(game: GameState, debug: boolean): boolean {
  return hallsteadUnlocked(game, balance) || debug;
}

/** Gegenstand auf dem Schreibtisch: eine Ledermappe mit dem Kuppelsiegel der Hauptstadt. */
export function HallsteadDeskItem({ game, at, glow, onOpen }: { game: GameState; at: Placement; glow: boolean; onOpen: () => void }) {
  const v = hallsteadView(game, balance, C);
  const anzahl = v.holdings.filter((h) => h.owned).length;
  const status = v.unlocked ? `${anzahl} ${anzahl === 1 ? 'Beteiligung' : 'Beteiligungen'} · ${v.favors} ${L(C.ui.favors)}` : 'verschlossen';
  return (
    <DeskObject id="hallstead" name={L(C.object.name)} at={at} sheet="hallstead" glow={glow} onOpen={onOpen} status={status} badge={v.telegramNews && v.unlocked ? { text: 'Telegramm' } : null}>
      <svg viewBox="0 0 100 70" className="hallstead-mappe" aria-hidden="true">
        <rect x="6" y="10" width="88" height="54" rx="4" className="mappe-leder" />
        <rect x="6" y="10" width="88" height="10" rx="3" className="mappe-klappe" />
        <circle cx="50" cy="40" r="13" className="mappe-siegel" />
        <path d="M41 45 h18 M43 45 v-6 M47 45 v-6 M53 45 v-6 M57 45 v-6 M42 39 h16 M44 39 q6 -9 12 0" className="mappe-kuppel" />
      </svg>
    </DeskObject>
  );
}

export function HallsteadSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const [meldung, setMeldung] = useState<string | null>(null);
  const v = hallsteadView(game, balance, C);

  function tu(r: HallsteadResult) {
    if (r.ok) {
      setMeldung(null);
      ctx.onGame(r.state);
    } else setMeldung(L(C.reasons[r.reason]));
  }

  if (!v.unlocked) {
    return (
      <div className="hallstead">
        <p>{L(C.object.locked)}</p>
        {ctx.debug && (
          <button type="button" onClick={() => ctx.onGame(debugUnlockHallstead(game, balance))}>
            {L(C.ui.debugUnlock)}
          </button>
        )}
      </div>
    );
  }

  const tabs: TabDef[] = [
    { id: 'beteiligungen', label: L(C.tabs.holdings) },
    { id: 'lobbyist', label: L(C.tabs.lobby), badge: v.favors > 0 ? String(v.favors) : undefined },
    { id: 'gesetze', label: L(C.tabs.laws) },
  ];
  const aktiv = activeTab('hallstead', tabs, ctx.tab);
  const min = balance.hallstead.lobby.donation.min;
  const lb = balance.hallstead.lobby;

  return (
    <div className="hallstead">
      <p className="muted">{L(C.object.hint)}</p>
      {v.telegram.length > 0 && (
        <aside className="hallstead-telegramm" aria-label={L(C.ui.telegram)}>
          <strong>{L(C.ui.telegram)}</strong>
          <ul>
            {v.telegram.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </aside>
      )}
      {meldung && (
        <p className="hint" role="status">
          {meldung}
        </p>
      )}
      <Tabs sheet="hallstead" tabs={tabs} active={aktiv} onChange={ctx.onTab}>
        {aktiv === 'beteiligungen' && (
          <ul className="hallstead-liste">
            {v.holdings.map((h) => (
              <li key={h.kind} className={h.owned ? 'besitz' : undefined}>
                <div className="hallstead-zeile">
                  <strong>{h.name}</strong>
                  {h.owned && (
                    <span>
                      {L(C.ui.value)} {money(h.value)} <span className="muted">({L(C.ui.invested)} {money(h.invested)})</span>
                    </span>
                  )}
                </div>
                <p className="muted">{h.text}</p>
                <div className="hallstead-knoepfe">
                  {(!h.single || !h.owned) && (
                    <button type="button" disabled={game.finished || game.cash < h.price} onClick={() => tu(buyHolding(game, balance, h.kind))}>
                      {L(h.owned ? C.ui.buyMore : C.ui.buy)} ({money(h.price)})
                    </button>
                  )}
                  {h.owned && (
                    <button type="button" disabled={game.finished} onClick={() => tu(sellHolding(game, balance, h.kind))}>
                      {L(C.ui.sell)} (≈ {money(h.proceeds)})
                    </button>
                  )}
                  {h.kind === 'zeitung' && h.owned && (
                    <button type="button" disabled={game.finished || v.newspaper.campaignDone} onClick={() => tu(runCampaign(game, balance))}>
                      {L(C.newspaper.campaign)}
                    </button>
                  )}
                </div>
                {h.kind === 'zeitung' && h.owned && (
                  <p className="hallstead-notiz">
                    {v.newspaper.credibility}
                    {v.newspaper.campaignDone && ` ${L(C.newspaper.campaignDone)}`}
                    {ctx.debug && <span className="muted"> (Glaubwürdigkeit {Math.round(game.hallstead?.holdings.credibility ?? 0)})</span>}
                  </p>
                )}
                {h.kind === 'bank' && v.bankDiscount && <p className="hallstead-notiz">{v.bankDiscount}</p>}
              </li>
            ))}
          </ul>
        )}

        {aktiv === 'lobbyist' && (
          <div className="hallstead-lobby">
            <p>
              {v.government} {fillText(L(C.ui.favorsHint), { favors: v.favors })}
            </p>
            {v.lobbyist ? (
              <div className="hallstead-person">
                <strong>{v.lobbyist.name}</strong> – {v.lobbyist.competence}, {v.lobbyist.trait}. {v.lobbyist.text}
                <div className="hallstead-knoepfe">
                  <span className="muted">
                    {L(C.ui.salary)}: {money(v.lobbyist.salary)}
                  </span>
                  {v.canBribe && (
                    <button type="button" title={L(C.ui.bribeHint)} disabled={game.finished || game.cash < lb.bribe.cost} onClick={() => tu(bribe(game, balance))}>
                      {fillText(L(C.ui.bribe), { cost: money(lb.bribe.cost) })}
                    </button>
                  )}
                  <button type="button" disabled={game.finished} onClick={() => tu(fireLobbyist(game, balance))}>
                    {L(C.ui.fire)}
                  </button>
                </div>
              </div>
            ) : (
              <ul className="hallstead-liste">
                {v.candidates.map((c) => (
                  <li key={c.id}>
                    <strong>{c.name}</strong> – {c.competence}, {c.trait}
                    <p className="muted">{c.text}</p>
                    <div className="hallstead-knoepfe">
                      <span className="muted">
                        {L(C.ui.salary)}: {money(c.salary)}
                      </span>
                      <button type="button" disabled={game.finished || game.cash < c.hireCost} onClick={() => tu(hireLobbyist(game, balance, c.id))}>
                        {L(C.ui.hire)} ({money(c.hireCost)})
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <h3>{L(C.ui.donate)}</h3>
            <p className="muted">{L(C.ui.donateHint)}</p>
            <div className="hallstead-knoepfe">
              {PARTY_IDS.map((p) => (
                <button key={p} type="button" disabled={game.finished || game.cash < min} onClick={() => tu(donate(game, balance, p, min))}>
                  {L(C.parties[p])}: {money(min)}
                </button>
              ))}
            </div>
            {v.donations.length > 0 && (
              <ul className="hallstead-spenden">
                {v.donations.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {aktiv === 'gesetze' && (
          <div className="hallstead-gesetze">
            {v.lawsPending && <p className="hint">{v.lawsPending}</p>}
            {!v.lobbyist && <p className="hint">{L(C.ui.needLobbyist)}</p>}
            <ul className="hallstead-liste">
              {v.laws.map((law) => (
                <li key={law.id}>
                  <div className="hallstead-zeile">
                    <strong>{law.name}</strong>
                    <span className="muted">{law.oil}</span>
                  </div>
                  {(law.pressure || law.watered) && (
                    <p className="hallstead-notiz">
                      {law.pressure}
                      {law.watered && ` ${L(C.ui.watered)}`}
                    </p>
                  )}
                  <div className="hallstead-knoepfe">
                    <button type="button" disabled={!v.lobbyist || v.favors < lb.pushCost} onClick={() => tu(pushLaw(game, balance, law.id, 1))}>
                      {L(C.ui.push)} ({lb.pushCost} {L(C.ui.favors)})
                    </button>
                    <button type="button" disabled={!v.lobbyist || v.favors < lb.pushCost} onClick={() => tu(pushLaw(game, balance, law.id, -1))}>
                      {L(C.ui.block)} ({lb.pushCost} {L(C.ui.favors)})
                    </button>
                    <button type="button" disabled={!v.lobbyist || v.favors < lb.waterCost} onClick={() => tu(waterDownLaw(game, balance, law.id))}>
                      {L(C.ui.water)} ({lb.waterCost} {L(C.ui.favors)})
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tabs>
    </div>
  );
}
