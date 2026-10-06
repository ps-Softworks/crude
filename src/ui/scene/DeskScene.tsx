// Der Schreibtisch als Szene (0.2.15+9): ein Bild, kein Scrollen. Oben die Wand
// mit Wandkarte, Pinnwand, Kalender, Familienfoto und Tür, darunter der Tisch
// mit Zeitung, Briefen, Notizspieß, Ruths Zettel, Kassenbuch, Akte, Fracht,
// Kladde und Glocke. Jeder Gegenstand ist ein Knopf und öffnet ein Fenster.
// Zahlen und Abzeichen sind nur gezählt – entschieden wird in src/sim.
// Das Menü liegt ab 0.2.15+11 nur noch im Knopf ☰ der Kopfleiste: Die Schublade
// bleibt für das Schattenbuch frei (GDD §16).

import { chapterRound, chapterRounds } from '../../sim/timeskip';
import type { ReactNode } from 'react';
import { agendaView } from '../../sim/agenda';
import type { NextStep } from '../../sim/desk';
import { familyView } from '../../sim/family';
import { formatDate, type GameState } from '../../sim/game';
import { storageCapacity } from '../../sim/logistics';
import { makeNewspaper } from '../../sim/newspaper';
import { rigSummary } from '../../sim/rigs';
import { stocksAttention } from '../../sim/stocks'; // 4.8 Andockpunkt
import type { TutorialView } from '../../sim/tutorial';
import { balance } from '../balance';
import { familyContent } from '../family';
import { barrels } from '../format';
import { landDeadlines, type InboxBadges, type OpenItem } from '../inbox';
import type { SilhouetteKind } from '../figures';
import { keyForSheet } from '../keys';
import { newspaperContent } from '../newspaper';
import type { SheetId } from '../sceneState';
import { Silhouette } from '../Silhouette';
import { rivalsLines } from '../sheets/RivalsSheet';
import { DeskObject, type Placement } from './DeskObject';
import { aufTisch, deskLayout, MAHAGONI_AB, sharedColumn, type DeskPresent, type DeskSpot } from './deskLayout'; // 0.4.20+10
import { RadioShape } from './objects/RadioShape';
import { chapterOf } from '../../sim/chapterOf';
import { Door } from './Door';
import {
  BellShape,
  CorkShape,
  DrawerShape,
  FolderShape,
  LampShape,
  LedgerShape,
  LetterStackShape,
  NotebookShape,
  PhotoFrameShape,
  SpikeShape,
  WallMapShape,
} from './objects/Shapes';
import { RuthNote } from './RuthNote';
// 4.6 Andockpunkt: Raffinerie (Gegenstand nur, wenn freigeschaltet).
import { RefineryShape } from './objects/RefineryShape';
import { refineryObjectStatus } from '../sheets/RefinerySheet';
import { refineryStatus } from '../../sim/refinery';
import { rt } from '../refinery';
import { StaffFileShape } from '../sheets/StaffSheet'; // 4.9 Andockpunkt
import { diplomacyPin } from '../sheets/DiplomacySheet'; // 4.10 Andockpunkt
// 4.11 Andockpunkt: Schublade (Schattenbuch) und Blaupause (Werkstatt), erst ab Kapitel 2.
import { localize } from '../../sim/i18n';
import { heat, heatWord, investigationUnlocked } from '../../sim/investigation';
import { researchUnlocked } from '../../sim/research';
import { investigationContent } from '../investigationContent';
import { BlueprintShape } from './objects/BlueprintShape';
// 4.14 Andockpunkt: Vertrieb (Marke und Tankstellen), erst ab Kapitel 3 auf dem Tisch.
import { BrandShape } from './objects/BrandShape';
import { brandDeskBadge, brandDeskStatus } from '../sheets/BrandSheet';
import { brandContent } from '../brand';
// 4.15 Andockpunkt: Börsenticker (erscheint erst mit der Börse, Kapitel 3).
import { ExchangeTicker } from './ExchangeTicker';
// 4.16 Andockpunkt: Hallstead-Mappe (ab Kapitel 3 oder per Debug-Freischaltung).
import { HallsteadDeskItem, hallsteadOnDesk } from '../sheets/HallsteadSheet';
// 4.17 Andockpunkt: Siegelmappe für Kapitel 3 (vorher nur im Debug sichtbar).
import { kapitel3Unlocked } from '../../sim/kapitel3';
import { kapitel3Pending } from '../../sim/kapitel3View';
import { SealFolderShape } from '../sheets/KonzernSheet';

export interface DeskSceneProps {
  game: GameState;
  badges: InboxBadges;
  debug: boolean;
  topBar: ReactNode;
  /** Zeitung in dieser Runde noch nicht aufgeschlagen. */
  newspaperNew: boolean;
  /** Autosave hat geklappt. */
  saved: boolean;
  step: NextStep | null;
  tutorial: TutorialView | null;
  tutorialOffer: boolean;
  onTutorial: (on: boolean) => void;
  /** Gegenstand, auf den Ruths Zettel zeigt (leuchtet). */
  glow: SheetId | 'karte' | 'tuer' | null;
  /** Der Rundgang zeigt gerade hierher (0.2.15+10). */
  spotlight: string | null;
  /** Wer vor der Tür wartet, der Erste vorn. */
  waiting: { names: readonly string[]; figure: SilhouetteKind | null };
  /** Wer gerade im Raum steht (Name) – dann steht die Tür offen. */
  inRoom: string | null;
  /** Familienmitglieder, die das Foto noch nicht zeigt (Thomas, solange die Geburtsszene offen ist). */
  hideFamily: readonly string[];
  /** Was offen liegt, für Ruths Zettel (0.2.15+11). */
  open: readonly OpenItem[];
  /** Bohrungen, die auf eine Entscheidung warten: Ranch und Satz. */
  wellsWaiting: readonly { parcelId: string; text: string }[];
  onItem: (item: OpenItem) => void;
  onWell: (parcelId: string) => void;
  /** Jemand Neues ist gekommen – es klopft. */
  knock: boolean;
  onDoor: () => void;
  onRuth: (() => void) | null;
  onOpen: (sheet: SheetId, tab?: string) => void;
  onMap: () => void;
}

export function DeskScene(p: DeskSceneProps) {
  const { game, badges } = p;
  const zeit = agendaView(game, balance);
  const krank = !game.finished && zeit.sickRounds > 0;
  const erschoepft = zeit.exhausted || krank;
  const lage = rivalsLines(game);
  const familieGanz = familyView(game, balance, familyContent);
  const familie = { ...familieGanz, members: familieGanz.members.filter((m) => !p.hideFamily.includes(m.id)) };
  const zeitung = game.finished ? null : makeNewspaper(game, balance, newspaperContent);
  // 4.14 Andockpunkt: Schild am Gegenstand „Vertrieb“; null = vor Kapitel 3 unsichtbar.
  const vertrieb = brandDeskStatus(game);
  // 4.16 Andockpunkt: Hallstead-Mappe auf dem Tisch? (ab Kapitel 3 oder per Debug-Freischaltung)
  const mappe = hallsteadOnDesk(game);
  // 4.17 Andockpunkt: Siegelmappe ab Kapitel 3 (oder nach „Kapitel 3 zur Probe öffnen“ im Debug-Reiter).
  const siegelmappe = kapitel3Unlocked(game, balance);
  // 0.4.20+10: Platzplan je Kapitel (src/ui/scene/deskLayout.ts) – ab Kapitel 3 der Mahagoni-Tisch.
  const kapitel = chapterOf(game);
  const mahagoni = kapitel >= MAHAGONI_AB;
  const da: DeskPresent = {
    raffinerie: !!game.refinery,
    personal: !!game.staff,
    schattenbuch: investigationUnlocked(game, balance),
    werkstatt: researchUnlocked(game, balance),
    marke: vertrieb !== null,
    boerse: !!game.exchange,
    hallstead: mappe,
    konzern: siegelmappe,
  };
  const AT = deskLayout(kapitel, da);
  // Personal und Vertrieb geteilt (Kapitel 1/2 vorab) oder Personal direkt unter der Tür (Kapitel 3): Abzeichen in die Ecke.
  const geteilt = sharedColumn(kapitel, da);
  // 0.4.20+12: Was auf dem Tisch liegt, rückt in die Tischplatte (Perspektive, aufTisch).
  const platz = (id: DeskSpot | SheetId): Placement => {
    const at = (AT as Partial<Record<string, Placement>>)[id];
    // Fehlt der Gegenstand (System noch zu), bleibt es wie vorher: kein Platz.
    return at ? aufTisch(at) : at!;
  };

  // Akte: was die Türme gerade tun, gezählt in src/sim (rigSummary).
  const tuerme = rigSummary(game);
  // Wartet ein Turm auf Jacobs Entscheidung, sagt das das Abzeichen („1 wartet“); das
  // Schild nennt nur den Rest, damit es nicht abgeschnitten wird (0.2.15+12).
  const akteStatus =
    tuerme.waiting > 0
      ? [tuerme.drilling > 0 && `${tuerme.drilling} bohrt`, tuerme.idle > 0 && `${tuerme.idle} frei`].filter(Boolean).join(' · ') || 'Entscheidung offen'
      : [
          tuerme.drilling > 0 && `${tuerme.drilling} bohr${tuerme.drilling === 1 ? 't' : 'en'}`,
          `${tuerme.idle} frei`,
          tuerme.delivering > 0 && `${tuerme.delivering} unterwegs`,
        ]
          .filter(Boolean)
          .join(' · ');

  // Fracht: Füllstand des Tanks gegen die Lagergrenze, nur als Anteil.
  const kapazitaet = storageCapacity(game, balance);
  const fuellung = kapazitaet > 0 ? Math.min(1, game.oilStock / kapazitaet) : 0;

  const leases = game.leases.filter((l) => l.holder === 'jacob').length;
  const options = game.options.filter((o) => o.holder === 'jacob').length;
  // Verfällt nach dieser Runde Land, trägt die Wandkarte eine Frist wie ein Brief (0.2.15+12).
  const frist = landDeadlines(game);
  const verfaellt = frist.options + frist.leases;

  // Familienfoto: je kälter das Wort, desto blasser das Bild (nur Wörter, keine Zahl).
  const RANG = { content: 0, neglected: 1, bitter: 2, estranged: 3 } as const;
  const kaelteste = familie.members.reduce<keyof typeof RANG>((w, m) => (RANG[m.word] > RANG[w] ? m.word : w), 'content');

  const obj = (id: SheetId, name: string, extra: Partial<Parameters<typeof DeskObject>[0]>, bild: ReactNode) => (
    <DeskObject
      id={id}
      name={name}
      shortcut={keyForSheet(id)}
      at={platz(id)}
      sheet={id}
      glow={p.glow === id || p.spotlight === id}
      onOpen={() => p.onOpen(id)}
      {...extra}
    >
      {bild}
    </DeskObject>
  );

  return (
    <div className={`schreibtisch${mahagoni ? ' mahagoni' : ''}${erschoepft ? ' erschoepft' : ''}${krank ? ' krank' : ''}`}>
      {p.topBar}
      <div className="szene">
        <div className="wand" aria-hidden="true" />
        {/* 0.4.20+12: Boden an den Seiten, Tischplatte als Trapez, vorn die Kante mit drei Schubladen. */}
        <div className="tisch" aria-hidden="true">
          <div className="tischplatte" />
          <div className="tischkante">
            <span className="schubladenfront" />
            <span className="schubladenfront" />
            <span className="schubladenfront" />
          </div>
        </div>
        {/* 0.4.20+10: Ablage für Hallstead- und Siegelmappe unter Ruths Zettel (nur Kapitel 3). */}
        {mahagoni && (da.hallstead || da.konzern) && <div className="ablage" aria-hidden="true" style={prozent(platz('ablage'))} />}

        {/* Wand */}
        <DeskObject
          id="karte"
          name="Wandkarte"
          shortcut="K"
          at={platz('karte')}
          glow={p.glow === 'karte' || p.spotlight === 'karte'}
          onOpen={p.onMap}
          status={`Pachten ${leases} · Optionen ${options}`}
          badge={!game.finished && verfaellt > 0 ? { text: verfaellt === 1 ? '1 verfällt' : `${verfaellt} verfallen`, urgent: true } : null}
        >
          <WallMapShape />
        </DeskObject>
        {obj(
          'konkurrenz',
          'Konkurrenz',
          {
            status: (
              <span className="pinnwand-zettel">
                <span>{lage.bullard}</span>
                {lage.wildcatter && <span>{lage.wildcatter}</span>}
                {diplomacyPin(game) && <span>{diplomacyPin(game)}</span> /* 4.10 Andockpunkt */}
              </span>
            ),
          },
          <CorkShape />,
        )}
        {mahagoni ? (
          // 0.4.20+10: Radio hinten auf der Tischkante – nur Zierde, kein Knopf.
          <div className="radio" aria-hidden="true" style={prozent(platz('radio'))}>
            <RadioShape />
          </div>
        ) : (
          <div className="lampe" aria-hidden="true" style={prozent(platz('lampe'))}>
            <LampShape />
          </div>
        )}
        {obj(
          'termine',
          'Kalender',
          // Feste Termine kommen jede Runde wieder – kein „neu“, und ein eigenes Wort, damit
          // sie nicht mit den freien Terminen oben in der Leiste verwechselt werden (0.2.15+12).
          // Etappe 1: Der Kalender ist das Planungsbrett; liegt ein Wochenbericht bei, steht das darauf.
          // 0.4.20+4: Beides zusammen passt nicht in eine Zeile des schmalen Kalenders – dann untereinander.
          (() => {
            const teile = [
              (game.plans?.report.length ?? 0) > 0 ? 'Wochenbericht' : null,
              badges.termine.count > 0 ? `${badges.termine.count} feste${badges.termine.count === 1 ? 'r' : ''} Termin${badges.termine.count === 1 ? '' : 'e'}` : null,
            ].filter((t): t is string => t !== null);
            if (teile.length < 2) return { status: teile[0] };
            return {
              status: (
                <>
                  {teile[0]}
                  <br />
                  {teile[1]}
                </>
              ),
            };
          })(),
          <span className="kalenderblatt">
            <span className="kalender-band" />
            <span className="kalender-zeit">{formatDate(game)}</span>
            <span className="kalender-runde">
              Runde {chapterRound(game)}
              <small>von {chapterRounds(game)}</small>
            </span>
          </span>,
        )}
        {obj(
          'familie',
          'Familie',
          {
            status: (
              <span className="foto-worte">
                {familie.members.map((m) => (
                  <span key={m.id}>
                    {m.name}: {m.wordText}
                  </span>
                ))}
              </span>
            ),
          },
          <span className={`foto foto-${kaelteste}`}>
            <PhotoFrameShape />
            {/* Jede Person im Bild, so wie es um sie steht: wer sich entfremdet, wird blass und wendet sich ab (GDD §3). */}
            <span className="foto-figur">
              {familie.members.map((m) => (
                <span key={m.id} className={`foto-person ${m.id} ${m.word}`}>
                  <Silhouette id={m.id} name={m.name} size={m.id === 'thomas' ? 30 : 44} />
                </span>
              ))}
            </span>
          </span>,
        )}
        <Door
          at={platz('tuer')}
          names={p.waiting.names}
          figure={p.waiting.figure}
          urgent={badges.tuer.urgent}
          knock={p.knock}
          inRoom={p.inRoom}
          glow={p.glow === 'tuer' || p.spotlight === 'tuer'}
          onEnter={p.onDoor}
        />

        {/* Tisch */}
        {obj(
          'zeitung',
          'Zeitung',
          { badge: p.newspaperNew && zeitung ? { text: 'neu' } : null, fresh: p.newspaperNew && !!zeitung },
          <span className="zeitung-gefaltet">
            <span className="zeitung-name">{zeitung?.name ?? 'Zeitung'}</span>
            <span className="zeitung-schlagzeile">{zeitung?.front.title ?? 'Keine neue Ausgabe'}</span>
            <span className="zeitung-spalten" />
          </span>,
        )}
        {obj(
          'post',
          'Briefe',
          {
            badge: badges.post.count > 0 ? { text: String(badges.post.count), urgent: badges.post.urgent } : null,
            status: badges.post.count === 0 ? 'leer' : undefined,
            fresh: badges.post.fresh,
          },
          <LetterStackShape count={badges.post.count} urgent={badges.post.urgent} />,
        )}
        {obj(
          'vorfaelle',
          'Vorfälle',
          {
            badge: badges.vorfaelle.count > 0 ? { text: String(badges.vorfaelle.count), urgent: badges.vorfaelle.urgent } : null,
            status: badges.vorfaelle.count === 0 ? 'leer' : undefined,
            fresh: badges.vorfaelle.fresh,
          },
          <SpikeShape count={badges.vorfaelle.count} urgent={badges.vorfaelle.urgent} />,
        )}
        <div className={p.spotlight === 'ruth' ? 'unterlage-platz rundgang-ziel' : 'unterlage-platz'} style={prozent(platz('ruth'))}>
          <RuthNote
            step={p.step}
            tutorial={p.tutorial}
            sickRounds={zeit.sickRounds}
            exhausted={zeit.exhausted}
            finished={game.finished}
            tutorialOffer={p.tutorialOffer}
            open={p.open}
            wellsWaiting={p.wellsWaiting}
            onGo={p.onRuth}
            onItem={p.onItem}
            onWell={p.onWell}
            onTutorial={p.onTutorial}
          />
        </div>
        {obj(
          'kassenbuch',
          'Kassenbuch',
          {
            badge:
              game.bankruptcyDeadline > 0
                ? { text: `Runde ${game.bankruptcyDeadline}`, urgent: true }
                : // 4.8 Andockpunkt: Stellvertreterkampf oder offene Forderung des Aufsichtsrats.
                  stocksAttention(game) === 'proxy'
                  ? { text: 'Misstrauen', urgent: true }
                  : stocksAttention(game) === 'demand'
                    ? { text: 'Aufsichtsrat' }
                    : null,
            status: `Rating ${game.rating}`,
            onOpen: () => p.onOpen('kassenbuch', stocksAttention(game) ? 'rat' : undefined),
          },
          <LedgerShape />,
        )}
        {obj(
          'akte',
          'Bohrturm-Akte',
          {
            status: akteStatus,
            badge: tuerme.waiting > 0 ? { text: `${tuerme.waiting} wartet` } : null,
            // Wartet eine Entscheidung, geht die Akte bei den Türmen auf – dort stehen die Knöpfe (0.2.15+12).
            onOpen: () => p.onOpen('akte', tuerme.waiting > 0 ? 'tuerme' : undefined),
          },
          <FolderShape variant="akte" />,
        )}
        {obj(
          'fracht',
          'Fracht',
          {
            status: (
              <span className="tank-messlatte" title={`${barrels(game.oilStock)} von ${barrels(kapazitaet)} bbl im Lager`}>
                <span className="tank-balken">
                  <span className={fuellung >= 0.9 ? 'tank-fuellung voll' : 'tank-fuellung'} style={{ transform: `scaleX(${fuellung})` }} />
                </span>
                <span className="tank-text">
                  Tank {barrels(game.oilStock)} / {barrels(kapazitaet)}
                </span>
              </span>
            ),
          },
          <FolderShape variant="fracht" />,
        )}
        {/* 4.6 Andockpunkt: Raffinerie – in Kapitel 1 (ohne Freischaltung) gibt es den Gegenstand nicht. */}
        {game.refinery &&
          obj(
            'raffinerie',
            rt('object'),
            { status: refineryObjectStatus(game) },
            <RefineryShape running={refineryStatus(game) === 'running' || refineryStatus(game) === 'expanding'} />,
          )}
        {/* 4.16 Andockpunkt: Hallstead-Mappe – erst ab Kapitel 3 (oder per Debug-Freischaltung im Menü). */}
        {mappe && (
          <HallsteadDeskItem game={game} at={platz('hallstead')} glow={p.glow === 'hallstead' || p.spotlight === 'hallstead'} onOpen={() => p.onOpen('hallstead')} />
        )}
        {/* 4.17 Andockpunkt: Siegelmappe – ab Kapitel 3 (Debug: „Kapitel 3 zur Probe öffnen“ im Menü). */}
        {siegelmappe && <KonzernObjekt game={game} obj={obj} at={platz('konzern')} />}
        {obj('protokoll', 'Kladde', { status: p.saved ? '✓ gesichert' : undefined }, <NotebookShape />)}
        {/* 4.9 Andockpunkt: Personalakten – erst ab Kapitel 2 (state.staff), in Kapitel 1 unsichtbar. */}
        {game.staff &&
          obj(
            'personal',
            'Personal',
            {
              status: `${game.staff.hired.length} angestellt`,
              // 0.4.19+3: In der geteilten Spalte bleibt das Abzeichen in der Ecke – darüber liegt die Beschriftung der Tür.
              badge:
                game.staff.candidates.length > 0
                  ? { text: `${game.staff.candidates.length} Bewerbung${game.staff.candidates.length === 1 ? '' : 'en'}`, ...(geteilt || mahagoni ? { corner: true } : {}) }
                  : null,
            },
            <StaffFileShape />,
          )}
        {/* 4.11 Andockpunkt: Schattenbuch und Werkstatt – in Kapitel 1 nicht auf dem Tisch. */}
        {investigationUnlocked(game, balance) &&
          obj('schattenbuch', 'Schublade', { status: `Hitze: ${localize(investigationContent.heat[heatWord(heat(game, balance), balance)])}` }, <DrawerShape />)}
        {researchUnlocked(game, balance) &&
          obj(
            'werkstatt',
            'Werkstatt',
            { status: game.research?.project ? 'forscht' : undefined },
            <BlueprintShape />,
          )}
        {/* 4.14 Andockpunkt: Vertrieb – nur sichtbar, wenn die Marke freigeschaltet ist (Kapitel 3). */}
        {vertrieb !== null &&
          (() => {
            const b = brandDeskBadge(game);
            // 0.4.19+3: Unter den Personalakten bleibt das Abzeichen in der Ecke, sonst verdeckt es „Personal“.
            const badge = b && geteilt ? { ...b, corner: true } : b;
            return obj('marke', localize(brandContent.object.name), { status: vertrieb, badge }, <BrandShape />);
          })()}
        {/* 4.15 Andockpunkt: Börsenticker – ohne Börse (Kapitel 1 und 2) nicht da. */}
        <ExchangeTicker
          game={game}
          at={platz('boerse')}
          board={mahagoni}
          glow={p.glow === 'boerse' || p.spotlight === 'boerse'}
          onOpen={() => p.onOpen('boerse')}
        />
        {obj(
          'glocke',
          game.finished ? 'Kapitel beendet' : 'Runde beenden',
          { className: 'glocke' },
          <BellShape />,
        )}
      </div>
    </div>
  );
}

/** Platz als CSS-Angabe in Prozent (Ruths Zettel, Lampe, Radio, Ablage – keine Knöpfe). */
function prozent(at: Placement) {
  return { left: `${at.left}%`, top: `${at.top}%`, width: `${at.width}%`, height: `${at.height}%` };
}

/** 4.17 Andockpunkt: die Siegelmappe mit Abzeichen für offene Entscheidungen. */
function KonzernObjekt({
  game,
  obj,
  at,
}: {
  game: GameState;
  obj: (id: SheetId, name: string, extra: Partial<Parameters<typeof DeskObject>[0]>, bild: ReactNode) => ReactNode;
  /** Geteilter Platz in der unteren Reihe; ohne Angabe AT.konzern. */
  at?: Placement;
}) {
  const offen = kapitel3Pending(game, balance);
  return obj(
    'konzern',
    'Siegelmappe',
    {
      badge: offen && offen.total > 0 ? { text: String(offen.total), urgent: offen.urgent } : null,
      status: offen ? undefined : 'Kapitel 3',
      ...(at ? { at } : {}),
    },
    <SealFolderShape />,
  );
}
