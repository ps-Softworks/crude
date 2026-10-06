// Fenster „Siegelmappe“ (4.17, Kapitel 3): Seismik, Mr. Vale, Konsortialprojekte,
// Hallstead (Stand) und Notizen. Was geht und was es kostet, sagt src/sim; hier
// wird nur gezeigt und geklickt. Texte aus content/kapitel3.yaml (src/ui/kapitel3.ts).

import type { ReactNode } from 'react';
import type { GameState } from '../../sim/game';
import { kapitel3Of, previewKapitel3, type Kapitel3Result, type Kapitel3State } from '../../sim/kapitel3';
import { kapitel3Pending } from '../../sim/kapitel3View';
import { answerFavor, answerInvitation, acceptRescue, favorChoices, invitationOpen, rescueAvailable, trustWord, type InvitationChoice } from '../../sim/konsortium';
import { declineProject, joinProject, projectDef } from '../../sim/projekte';
import { busyCrews, buyLicense, buyLicenseWithFavors, hireCrew, licenseCost, techStage } from '../../sim/seismik';
import { arrangeMarriage, breakOrder, donate, joinClub, standStatus } from '../../sim/stand';
import { parcelLabel } from '../../sim/lease';
import { balance } from '../balance';
import { money, percent, rounds } from '../format';
import { k3, noteText, reasonText, reportText, ROMAN, t } from '../kapitel3';
import { Tabs, activeTab } from '../sheet/Tabs';
import type { SheetContext } from './types';

const B = balance.kapitel3;

/** Ein Knopf für eine Aktion aus src/sim: gesperrt mit Grund, sonst neuer Spielstand. */
function Aktion({ result, onGame, children, title }: { result: Kapitel3Result; onGame: (s: GameState) => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" disabled={!result.ok} title={result.ok ? title : reasonText(result.reason)} onClick={() => result.ok && onGame(result.state)}>
      {children}
    </button>
  );
}

/** Grund unter einem gesperrten Knopf – sichtbar, nicht nur im Tooltip. */
function Grund({ result }: { result: Kapitel3Result }) {
  return result.ok ? null : <span className="weg-grund">{reasonText(result.reason)}</span>;
}

function ranchName(game: GameState, id: string): string {
  const p = game.parcels.find((x) => x.id === id);
  return p ? parcelLabel(p) : id;
}

function SeismikTab({ ctx, k }: { ctx: SheetContext; k: Kapitel3State }) {
  const { game, onGame } = ctx;
  const stufe = techStage(game, balance);
  const kosten = licenseCost(k, balance);
  const lizenz = buyLicense(game, balance);
  const lizenzGefallen = buyLicenseWithFavors(game, balance);
  const trupp = hireCrew(game, balance);
  const berichte = Object.values(k.seismik.reports).sort((a, b) => b.round - a.round);
  return (
    <>
      <p className="muted">{t(k3.seismik.intro)}</p>
      <p>
        {t(k3.seismik.stage)}: <strong>{ROMAN[stufe - 1]}</strong> · Seismik braucht {ROMAN[B.seismik.stage - 1]}
      </p>
      <div className="actions">
        {!k.seismik.license && (
          <>
            <Aktion result={lizenz} onGame={onGame}>
              {kosten === 0 ? t(k3.seismik.licenseFree) : `${t(k3.seismik.license)} (${money(kosten)})`}
            </Aktion>
            <Grund result={lizenz} />
            {kosten > 0 && B.seismik.licenseFavors > 0 && (
              <Aktion result={lizenzGefallen} onGame={onGame}>
                {`${t(k3.seismik.licenseFavors)} (${B.seismik.licenseFavors})`}
              </Aktion>
            )}
          </>
        )}
        {k.seismik.license && (
          <>
            <span>
              Trupps: {busyCrews(k)} von {k.seismik.crews} unterwegs
            </span>
            <Aktion result={trupp} onGame={onGame}>
              {`${t(k3.seismik.crew)} (${money(B.seismik.crewCost)})`}
            </Aktion>
          </>
        )}
      </div>
      {k.seismik.license && <p className="muted">{t(k3.seismik.howTo)} Kosten je Ranch: {money(B.seismik.surveyCost)}.</p>}
      {k.seismik.surveys.length > 0 && (
        <ul className="sources">
          {k.seismik.surveys.map((s) => (
            <li key={s.parcelId}>
              <strong>{ranchName(game, s.parcelId)}</strong>
              <span className="lage">
                {t(k3.seismik.pending)} – Bericht ab Runde {s.readyRound}
              </span>
            </li>
          ))}
        </ul>
      )}
      {berichte.length > 0 && (
        <ul className="sources">
          {berichte.map((r) => (
            <li key={r.parcelId}>
              <strong>{ranchName(game, r.parcelId)}</strong>
              <span className="lage">{reportText(r)}</span>
              <button type="button" className="link" onClick={() => ctx.showOnMap(r.parcelId)}>
                {t(k3.seismik.showOnMap)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function KonsortiumTab({ ctx, k }: { ctx: SheetContext; k: Kapitel3State }) {
  const { game, onGame } = ctx;
  const kon = k.konsortium;
  const pfad = kon.path ?? (kon.invitedRound > 0 ? null : 'offen');
  const favor = kon.favor;
  const favorDef = favor ? B.konsortium.favors.find((f) => f.id === favor.id) : undefined;
  const favorText = favor ? k3.konsortium.favors[favor.id] : undefined;
  return (
    <>
      {pfad && <p>{t(k3.konsortium.paths[pfad])}</p>}
      {kon.invitedRound > 0 && kon.path !== 'verstossen' && <p className="muted">{t(k3.konsortium.trust[trustWord(k, balance)])}</p>}
      {kon.controlled && <p className="muted">{t(k3.konsortium.controlled)}</p>}

      {invitationOpen(k) && (
        <article className="event brief">
          <h3>{t(k3.konsortium.letter.title)}</h3>
          <p>{t(k3.konsortium.letter.text)}</p>
          <p className="muted">Antwort bis Runde {kon.inviteDeadline}. Wer schweigt, hat abgelehnt.</p>
          <div className="actions">
            {(['annehmen', 'ablehnen', 'ausspielen'] as InvitationChoice[]).map((c) => (
              <span key={c}>
                <Aktion result={answerInvitation(game, balance, c)} onGame={onGame}>
                  {t(k3.konsortium.choices[c].label)}
                </Aktion>{' '}
                <span className="muted">{t(k3.konsortium.choices[c].hint)}</span>
              </span>
            ))}
          </div>
        </article>
      )}

      {favor && favorText && (
        <article className="event brief">
          <h3>{t(favorText.title)}</h3>
          <p>{t(favorText.text)}</p>
          <p className="muted">
            Antwort bis Runde {favor.deadline}. Ohne Antwort gilt er als verweigert.
            {favorDef && favorDef.cash > 0 && ` Erfüllen kostet ${money(favorDef.cash)}.`}
          </p>
          <div className="actions">
            {favorChoices(k).map((c) => (
              <Aktion key={c} result={answerFavor(game, balance, c)} onGame={onGame}>
                {t(k3.konsortium.favorChoices[c])}
              </Aktion>
            ))}
          </div>
        </article>
      )}

      {rescueAvailable(game, balance) && (
        <article className="event brief dringend">
          <h3>{t(k3.konsortium.rescue.title)}</h3>
          <p>{t(k3.konsortium.rescue.text)}</p>
          <Aktion result={acceptRescue(game, balance)} onGame={onGame}>
            {`${t(k3.konsortium.rescue.accept)} (${money(B.konsortium.rescue.cash)})`}
          </Aktion>
        </article>
      )}
    </>
  );
}

function ProjekteTab({ ctx, k }: { ctx: SheetContext; k: Kapitel3State }) {
  const { game, onGame } = ctx;
  return (
    <>
      <p className="muted">{t(k3.projekte.intro)}</p>
      {k.projekte.offers.length === 0 && <p className="muted">Gerade liegt kein Angebot auf dem Tisch.</p>}
      {k.projekte.offers.map((o) => {
        const def = projectDef(balance, o.id);
        const text = k3.projekte.list[o.id];
        if (!def || !text) return null;
        const versuche = B.projekte.shares.map((share) => ({ share, result: joinProject(game, balance, o.id, share) }));
        const gesperrt = versuche.every((v) => !v.result.ok) ? versuche[0].result : null;
        return (
          <article key={o.id} className="event brief">
            <h3>{t(text.title)}</h3>
            <p>{t(text.text)}</p>
            <p className="muted">
              Ganzes Projekt: {money(def.cost)} · Bauzeit {rounds(def.rounds)} · Ertrag {money(def.income)} je Runde · Angebot bis Runde {o.until}
            </p>
            <div className="actions">
              {versuche.map((v) => (
                <Aktion key={v.share} result={v.result} onGame={onGame}>
                  {`${percent(v.share)} ${t(k3.projekte.share)} (${money(v.share * def.cost)})`}
                </Aktion>
              ))}
              <Aktion result={declineProject(game, balance, o.id)} onGame={onGame}>
                {t(k3.projekte.decline)}
              </Aktion>
              {gesperrt && <Grund result={gesperrt} />}
            </div>
          </article>
        );
      })}
      {k.projekte.stakes.length > 0 && (
        <>
          <h3>Beteiligungen</h3>
          <ul className="sources">
            {k.projekte.stakes.map((s) => (
              <li key={s.id} className={s.status}>
                <strong>{k3.projekte.list[s.id] ? t(k3.projekte.list[s.id].title) : s.id}</strong>
                <span className="lage">
                  {percent(s.share)} · {t(k3.projekte.status[s.status])}
                  {s.status === 'bau' && ` bis Runde ${s.readyRound}`}
                  {s.earned > 0 && ` · bisher ${money(s.earned)}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function StandTab({ ctx, k }: { ctx: SheetContext; k: Kapitel3State }) {
  const { game, onGame } = ctx;
  const status = standStatus(k, balance);
  const S = B.stand;
  const wege = [
    { id: 'donation' as const, result: donate(game, balance), cost: S.donation.cost },
    { id: 'marriage' as const, result: arrangeMarriage(game, balance), cost: S.marriage.cost },
    { id: 'club' as const, result: joinClub(game, balance), cost: S.club.cost },
    { id: 'breakOrder' as const, result: breakOrder(game, balance), cost: S.breakOrder.cost },
  ];
  return (
    <>
      <p className="muted">{t(k3.stand.intro)}</p>
      <p>
        Jacob gilt als <strong>{t(k3.stand.ranks[status].word)}</strong>. {t(k3.stand.ranks[status].line)}
      </p>
      {wege.map((w) => (
        <section key={w.id}>
          <h3>{t(k3.stand.ways[w.id].title)}</h3>
          <p>{t(k3.stand.ways[w.id].text)}</p>
          <div className="actions">
            <Aktion result={w.result} onGame={onGame}>
              {`${t(k3.stand.ways[w.id].action)} (${money(w.cost)})`}
            </Aktion>
            <Grund result={w.result} />
          </div>
        </section>
      ))}
    </>
  );
}

function NotizenTab({ game, k }: { game: GameState; k: Kapitel3State }) {
  if (k.notes.length === 0) return <p className="muted">Noch nichts geschehen.</p>;
  return (
    <ul className="pinnwand-liste">
      {[...k.notes].reverse().map((n, i) => (
        <li key={`${n.round}-${i}`}>
          Runde {n.round}: {noteText(game, n)}
        </li>
      ))}
    </ul>
  );
}

/**
 * 4.17 Andockpunkt (Debug-Reiter im Menü, gemeinsamer Abschnitt „Vorab freischalten“):
 * Kapitel 3 zur Probe öffnen – Siegelmappe mit Seismik, Mr. Vale, Projekten und Stand.
 */
export function KonzernDebugButton({ ctx }: { ctx: SheetContext }) {
  if (ctx.game.kapitel3) return <span className="muted klein">Siegelmappe ist freigeschaltet.</span>;
  if (ctx.game.finished) return null;
  return (
    <button type="button" onClick={() => ctx.onGame(previewKapitel3(ctx.game, balance))}>
      {t(k3.desk.preview)}
    </button>
  );
}

export function KonzernSheet({ ctx }: { ctx: SheetContext }) {
  const { game } = ctx;
  const k = kapitel3Of(game, balance);
  if (!k) {
    return (
      <>
        <p className="muted">{t(k3.desk.locked)}</p>
      </>
    );
  }
  const offen = kapitel3Pending(game, balance);
  const zahl = (n: number) => (n > 0 ? String(n) : undefined);
  const tabs = [
    { id: 'seismik', label: t(k3.desk.tabs.seismik), badge: zahl(offen?.reports ?? 0) },
    { id: 'konsortium', label: t(k3.desk.tabs.konsortium), badge: zahl(Number(offen?.invitation) + Number(offen?.favor) + Number(offen?.rescue)) },
    { id: 'projekte', label: t(k3.desk.tabs.projekte), badge: zahl(offen?.offers ?? 0) },
    { id: 'stand', label: t(k3.desk.tabs.stand) },
    { id: 'notizen', label: t(k3.desk.tabs.notizen) },
  ];
  const tab = activeTab('konzern', tabs, ctx.tab);
  const inhalt: Record<string, () => ReactNode> = {
    seismik: () => <SeismikTab ctx={ctx} k={k} />,
    konsortium: () => <KonsortiumTab ctx={ctx} k={k} />,
    projekte: () => <ProjekteTab ctx={ctx} k={k} />,
    stand: () => <StandTab ctx={ctx} k={k} />,
    notizen: () => <NotizenTab game={game} k={k} />,
  };
  return (
    <Tabs sheet="konzern" tabs={tabs} active={tab} onChange={ctx.onTab}>
      {inhalt[tab]()}
    </Tabs>
  );
}

/** Siegelmappe auf dem Tisch: Ledermappe mit grauem Siegel (Vale) – reine Dekoration. */
export function SealFolderShape() {
  return (
    <svg viewBox="0 0 110 80" className="form" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <rect x="8" y="10" width="94" height="62" rx="3" className="f-leder" />
      <rect x="16" y="18" width="78" height="46" className="f-papier" />
      <g className="s-tinte">
        <line x1="24" y1="30" x2="70" y2="30" />
        <line x1="24" y1="40" x2="62" y2="40" />
      </g>
      <circle cx="78" cy="52" r="9" className="f-rot" />
      <circle cx="78" cy="52" r="5" className="f-rot-hell" />
    </svg>
  );
}
