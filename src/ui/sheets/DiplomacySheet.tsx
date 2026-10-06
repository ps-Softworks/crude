// Pinnwand „Konkurrenz“ ab Kapitel 2 (4.10): Reiter Nachfolge, Absprachen,
// Übernahmen, Verband. Zahlen, Gründe und Regeln kommen aus src/sim/diplomacy*,
// die Texte aus content/diplomacy.yaml – hier wird nichts gerechnet und nichts entschieden.

import { useState } from "react";
import {
  answerOffer,
  backHeir,
  breakPact,
  buyFirm,
  diplomacyView,
  joinGuild,
  leaveGuild,
  openOffers,
  proposePact,
  pushBreakup,
  startDiplomacy,
  type DiploReason,
  type DiploResult,
  type DiplomacyView,
} from "../../sim/diplomacy";
import { estimateOffer, type OfferEstimate } from "../../sim/diplomacyEstimate";
import {
  diploText,
  respectWord,
  type DiploTab,
} from "../../sim/diplomacyContent";
import type { GameState } from "../../sim/game";
import { balance } from "../balance";
import { diplomacyContent as C } from "../diplomacyContent";
import { money, NBSP, percent, rounds } from "../format";
import type { TabDef } from "../sheet/Tabs";
import type { SheetContext } from "./types";
import { ConfirmButton } from "../ConfirmButton";

const T = C.texts;

/** Preis je Barrel mit Cent, z. B. „0,06 $“ (wie im Verkaufsfenster). */
function price(value: number): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}$`;
}

/** Zwei Zeilen unter einem Angebot: geschätzter Ertrag je Runde samt Laufzeit, dazu Spur/Kartellgesetz. */
function Schaetzung({
  game,
  kind,
  law,
  lead = true,
}: {
  game: GameState;
  kind: keyof typeof C.kinds;
  law: boolean;
  lead?: boolean;
}) {
  const e: OfferEstimate | null = estimateOffer(game, balance, kind);
  if (!e) return null;
  const runden = rounds(e.rounds);
  const betrag = e.perRound === null ? "" : money(e.perRound);
  const text =
    e.leaseDiscount !== null
      ? diploText(T.estimate_lease, {
          anteil: percent(e.leaseDiscount),
          runden,
        })
      : e.perRound === null
        ? diploText(T.estimate_none, { runden })
        : e.perBarrel !== null
          ? diploText(T.estimate_barrel, {
              betrag,
              preis: price(e.perBarrel),
              runden,
            })
          : diploText(T.estimate, { betrag, runden });
  return (
    <>
      {lead && <br />}
      <span className="klein">{text}</span>
      {e.cartel && (
        <>
          <br />
          <span className="klein hint">
            {diploText(law ? T.estimate_trace_law : T.estimate_trace_none, {
              n: e.traceSeverity,
            })}
          </span>
        </>
      )}
    </>
  );
}

function grund(reason: DiploReason | null): string | undefined {
  return reason ? diploText(C.reasons[reason]) : undefined;
}

function name(rival: keyof typeof C.rivals): string {
  return diploText(C.rivals[rival].name);
}

/** Ein Knopf für eine Aktion der Diplomatie: gesperrt mit Grund, sonst neuer Spielstand. */
function Knopf({
  reason,
  run,
  onGame,
  children,
  confirm,
}: {
  reason: DiploReason | null;
  run: () => DiploResult;
  onGame: (s: GameState) => void;
  children: string;
  confirm?: string;
}) {
  const los = () => {
    const r = run();
    if (r.ok) onGame(r.state);
  };
  // Rückfrage im Spiel statt window.confirm (im iframe gesperrt, 0.4.20+1).
  if (confirm) {
    return (
      <ConfirmButton
        question={confirm}
        confirmLabel={`Ja: ${children}`}
        disabled={reason !== null}
        title={grund(reason)}
        onConfirm={los}
      >
        {children}
      </ConfirmButton>
    );
  }
  return (
    <button
      type="button"
      disabled={reason !== null}
      title={grund(reason)}
      onClick={los}
    >
      {children}
    </button>
  );
}

/** Kurze Zeile für die Pinnwand am Schreibtisch – null, solange es nichts zu sagen gibt. */
export function diplomacyPin(game: GameState): string | null {
  const view = diplomacyView(game, balance);
  if (!view) return null;
  const n = openOffers(game);
  if (n > 0) return diploText(T.pin_offers, { n });
  if (view.succession.outcome === null)
    return diploText(T.pin_running, {
      runden: rounds(view.succession.roundsLeft),
    });
  return null;
}

/** Die Reiter der Pinnwand ab Kapitel 2 (ohne „Revier“, das zeigt RivalsSheet). */
export function diplomacyTabs(game: GameState): TabDef[] {
  const view = diplomacyView(game, balance);
  if (!view) return [];
  const angebote = view.offers.length;
  const tab = (id: DiploTab, badge?: string): TabDef => ({
    id,
    label: diploText(C.tabs[id]),
    ...(badge ? { badge } : {}),
  });
  return [
    tab(
      "nachfolge",
      view.succession.outcome === null
        ? rounds(view.succession.roundsLeft)
        : undefined,
    ),
    tab("absprachen", angebote > 0 ? String(angebote) : undefined),
    tab("uebernahmen"),
    tab("verband"),
  ];
}

export function revierTabLabel(): string {
  return diploText(C.tabs.revier);
}

function Nachfolge({
  game,
  view,
  onGame,
}: {
  game: GameState;
  view: DiplomacyView;
  onGame: (s: GameState) => void;
}) {
  const s = view.succession;
  return (
    <div className="diplomatie">
      {s.outcome === null ? (
        <>
          <p>
            {diploText(T.succession_running, {
              sitze: s.seats,
              alle: s.boardSeats,
              runden: rounds(s.roundsLeft),
            })}
          </p>
          <p className={s.talk === "ruhig" ? "muted" : "hint"}>
            {diploText(C.talk[s.talk])}
          </p>
          <div className="actions zeile">
            <Knopf
              reason={s.backReason}
              run={() => backHeir(game, balance, "margaret")}
              onGame={onGame}
            >
              {diploText(T.back_margaret, { kosten: money(s.backCost) })}
            </Knopf>
            <Knopf
              reason={s.backReason}
              run={() => backHeir(game, balance, "pruett")}
              onGame={onGame}
            >
              {diploText(T.back_pruett, { kosten: money(s.backCost) })}
            </Knopf>
          </div>
          <div className="actions zeile">
            <Knopf
              reason={s.pushReason}
              run={() => pushBreakup(game, balance, 1)}
              onGame={onGame}
            >
              {diploText(T.push_for, { kosten: money(s.pushCost) })}
            </Knopf>
            <Knopf
              reason={s.pushReason}
              run={() => pushBreakup(game, balance, -1)}
              onGame={onGame}
            >
              {diploText(T.push_against, { kosten: money(s.pushCost) })}
            </Knopf>
          </div>
          <p className="erklaerung">{diploText(T.succession_hint)}</p>
        </>
      ) : (
        <p>{diploText(C.outcome[s.outcome])}</p>
      )}
      <h3>{diploText(T.relations_title)}</h3>
      <p className="muted">{diploText(C.respect[respectWord(view.respect)])}</p>
      <ul className="pinnwand-liste klein">
        {view.relations.map((r) => (
          <li key={r.rival}>
            {diploText(T.relation_line, {
              name: name(r.rival),
              firma: diploText(C.rivals[r.rival].firm),
              stimmung: diploText(C.moods[r.mood]),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Absprachen({
  game,
  view,
  onGame,
}: {
  game: GameState;
  view: DiplomacyView;
  onGame: (s: GameState) => void;
}) {
  const [antwort, setAntwort] = useState<string | null>(null);
  const kosten = money(balance.diplomacy.pacts.crossCost);
  const wirkung = view.effects;
  // Was gar nicht geht (Art passt nicht) oder schon läuft, steht nicht in der Liste.
  const vorschlaege = view.proposals.filter(
    (p) => p.reason !== "art" && p.reason !== "laeuft",
  );
  const vorschlagRivalen = [...new Set(vorschlaege.map((p) => p.rival))];
  return (
    <div className="diplomatie">
      <h3>{diploText(T.offers_title)}</h3>
      {view.offers.length === 0 ? (
        <p className="muted">{diploText(T.offers_none)}</p>
      ) : (
        <ul className="pinnwand-liste">
          {view.offers.map((o) => (
            <li key={o.id}>
              <strong>
                {diploText(T.offer_line, {
                  name: name(o.rival),
                  art: diploText(C.kinds[o.kind].label),
                })}
              </strong>{" "}
              <span className="muted">
                {diploText(T.offer_left, { runden: rounds(o.roundsLeft) })}
              </span>
              <br />
              <span className="klein">
                {diploText(C.kinds[o.kind].text, {
                  kosten,
                  preis: money(o.price ?? 0),
                })}
              </span>
              <Schaetzung game={game} kind={o.kind} law={view.law} />
              <div className="actions zeile">
                <Knopf
                  reason={null}
                  run={() => answerOffer(game, balance, o.id, true)}
                  onGame={onGame}
                  confirm={
                    o.kind === "buyout"
                      ? diploText(C.kinds.buyout.text, {
                          preis: money(o.price ?? 0),
                        })
                      : undefined
                  }
                >
                  {diploText(o.kind === "buyout" ? T.accept_buyout : T.accept)}
                </Knopf>
                <Knopf
                  reason={null}
                  run={() => answerOffer(game, balance, o.id, false)}
                  onGame={onGame}
                >
                  {diploText(T.decline)}
                </Knopf>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3>{diploText(T.pacts_title)}</h3>
      {view.pacts.length === 0 ? (
        <p className="muted">{diploText(T.pacts_none)}</p>
      ) : (
        <ul className="pinnwand-liste">
          {view.pacts.map((p) => (
            <li key={p.id}>
              {diploText(T.pact_line, {
                art: diploText(C.kinds[p.kind].label),
                name: name(p.rival),
                runden: rounds(p.roundsLeft),
              })}
              {p.illegal && (
                <span className="hint"> {diploText(T.pact_illegal)}</span>
              )}
              <div className="actions zeile">
                <Knopf
                  reason={null}
                  run={() => breakPact(game, balance, p.id)}
                  onGame={onGame}
                  confirm={diploText(T.break_confirm)}
                >
                  {diploText(T.break)}
                </Knopf>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3>{diploText(T.propose_title)}</h3>
      {vorschlaege.length === 0 ? (
        <p className="muted">{diploText(T.propose_none)}</p>
      ) : (
        <ul className="pinnwand-liste">
          {vorschlagRivalen.map((rival) => (
            <li key={rival}>
              {name(rival)}
              <div className="actions zeile">
                {vorschlaege
                  .filter((p) => p.rival === rival)
                  .map((p) => (
                    <button
                      key={p.kind}
                      type="button"
                      disabled={p.reason !== null}
                      title={
                        grund(p.reason) ??
                        diploText(C.kinds[p.kind].text, { kosten })
                      }
                      onClick={() => {
                        const r = proposePact(game, balance, p.rival, p.kind);
                        if (!r.ok) return;
                        setAntwort(
                          `${name(p.rival)}: ${diploText(r.accepted ? T.accepted : T.refused)}`,
                        );
                        onGame(r.state);
                      }}
                    >
                      {diploText(C.kinds[p.kind].label)}
                    </button>
                  ))}
              </div>
              {vorschlaege
                .filter((p) => p.rival === rival && p.reason === null)
                .map((p) => (
                  <div key={p.kind}>
                    <span className="klein muted">
                      {diploText(C.kinds[p.kind].label)}:{" "}
                    </span>
                    <Schaetzung
                      game={game}
                      kind={p.kind}
                      law={view.law}
                      lead={false}
                    />
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
      {antwort && <p className="hint">{antwort}</p>}
      {(wirkung.price !== 0 || wirkung.leaseCost !== 0) && (
        <p className="erklaerung">
          {diploText(T.effects, {
            preis: `${wirkung.price >= 0 ? "+" : "−"}${price(Math.abs(wirkung.price))}`,
            pacht: `${wirkung.leaseCost > 0 ? "+" : wirkung.leaseCost < 0 ? "−" : "±"}${percent(Math.abs(wirkung.leaseCost))}`,
          })}
        </p>
      )}
      {view.heat > 0 && (
        <p className="hint">{diploText(T.heat, { n: view.heat })}</p>
      )}
    </div>
  );
}

function Uebernahmen({
  game,
  view,
  onGame,
}: {
  game: GameState;
  view: DiplomacyView;
  onGame: (s: GameState) => void;
}) {
  if (view.firms.length === 0)
    return <p className="muted">{diploText(T.takeovers_none)}</p>;
  return (
    <div className="diplomatie">
      <p className="erklaerung">{diploText(T.takeovers_intro)}</p>
      <ul className="pinnwand-liste">
        {view.firms.map((f) => (
          <li key={f.name}>
            {diploText(T.firm_line, { name: f.name, quellen: f.wells })}
            {f.owner === "jacob" && (
              <span className="muted"> · {diploText(T.firm_jacob)}</span>
            )}
            {f.owner === "pruett" && (
              <span className="muted"> · {diploText(T.firm_pruett)}</span>
            )}
            {f.owner === null && (
              <div className="actions zeile">
                <Knopf
                  reason={f.reason}
                  run={() => buyFirm(game, balance, f.name)}
                  onGame={onGame}
                >
                  {diploText(T.buy, { preis: money(f.price) })}
                </Knopf>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Verband({
  game,
  view,
  onGame,
}: {
  game: GameState;
  view: DiplomacyView;
  onGame: (s: GameState) => void;
}) {
  const g = view.guild;
  if (!g.founded)
    return <p className="muted">{diploText(T.guild_not_founded)}</p>;
  return (
    <div className="diplomatie">
      <p>
        {diploText(T.guild_status, {
          mitglieder: g.members,
          kraft: percent(g.strength),
        })}
      </p>
      {g.expelled ? (
        <p className="hint">{diploText(T.guild_expelled)}</p>
      ) : g.member ? (
        <>
          <p>{diploText(T.guild_member, { beitrag: money(g.dues) })}</p>
          <div className="actions zeile">
            <Knopf
              reason={g.leaveReason}
              run={() => leaveGuild(game, balance)}
              onGame={onGame}
            >
              {diploText(T.guild_leave)}
            </Knopf>
          </div>
        </>
      ) : (
        <div className="actions zeile">
          <Knopf
            reason={g.joinReason}
            run={() => joinGuild(game, balance)}
            onGame={onGame}
          >
            {diploText(T.guild_join, { beitrag: money(g.dues) })}
          </Knopf>
        </div>
      )}
    </div>
  );
}

/** Inhalt eines Diplomatie-Reiters. */
export function DiplomacyTab({ tab, ctx }: { tab: string; ctx: SheetContext }) {
  const view = diplomacyView(ctx.game, balance);
  if (!view) return null;
  const props = { game: ctx.game, view, onGame: ctx.onGame };
  switch (tab) {
    case "nachfolge":
      return <Nachfolge {...props} />;
    case "absprachen":
      return <Absprachen {...props} />;
    case "uebernahmen":
      return <Uebernahmen {...props} />;
    case "verband":
      return <Verband {...props} />;
    default:
      return null;
  }
}

/** Debug (Menü → Debug): Diplomatie aus Kapitel 2 schon jetzt einschalten, um sie anzusehen. */
export function DiplomacyDebug({ ctx }: { ctx: SheetContext }) {
  return (
    <p>
      <button
        type="button"
        disabled={ctx.game.diplomacy !== undefined || ctx.game.finished}
        onClick={() =>
          ctx.onGame(
            startDiplomacy(ctx.game, balance, balance.diplomacy.unlockChapter),
          )
        }
      >
        {diploText(T.debug_start)}
      </button>
    </p>
  );
}
