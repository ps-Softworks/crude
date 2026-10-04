// Der Schreibtisch als Szene (0.2.15+9): ein Bild, kein Scrollen. Oben die Wand
// mit Wandkarte, Pinnwand, Kalender, Familienfoto und Tür, darunter der Tisch
// mit Zeitung, Briefen, Notizspieß, Ruths Zettel, Kassenbuch, Akte, Fracht,
// Kladde und Glocke. Jeder Gegenstand ist ein Knopf und öffnet ein Fenster.
// Zahlen und Abzeichen sind nur gezählt – entschieden wird in src/sim.
// Das Menü liegt ab 0.2.15+11 nur noch im Knopf ☰ der Kopfleiste: Die Schublade
// bleibt für das Schattenbuch frei (GDD §16).

import type { ReactNode } from 'react';
import { agendaView } from '../../sim/agenda';
import type { NextStep } from '../../sim/desk';
import { familyView } from '../../sim/family';
import { formatDate, type GameState } from '../../sim/game';
import { storageCapacity } from '../../sim/logistics';
import { makeNewspaper } from '../../sim/newspaper';
import { rigSummary } from '../../sim/rigs';
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
import { Door } from './Door';
import {
  BellShape,
  CorkShape,
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
import { diplomacyPin } from '../sheets/DiplomacySheet'; // 4.10 Andockpunkt

/** Wo was liegt, in Prozent der Bühne (unter der Kopfleiste). */
const AT: Partial<Record<SheetId | 'karte' | 'tuer', Placement>> & Record<'karte' | 'tuer', Placement> = {
  karte: { left: 2, top: 4, width: 22, height: 34 },
  konkurrenz: { left: 26, top: 6, width: 15, height: 28 },
  termine: { left: 58, top: 4, width: 10, height: 30 },
  familie: { left: 70.5, top: 6, width: 13, height: 28 },
  tuer: { left: 86, top: 0, width: 12, height: 42 },
  zeitung: { left: 2.5, top: 48, width: 15, height: 24 },
  post: { left: 19, top: 47, width: 13, height: 25 },
  vorfaelle: { left: 33.5, top: 46, width: 8.5, height: 26 },
  kassenbuch: { left: 73, top: 47, width: 12, height: 25 },
  akte: { left: 3, top: 75, width: 14, height: 22 },
  fracht: { left: 19, top: 75, width: 15, height: 22 },
  protokoll: { left: 36, top: 76, width: 9, height: 21 },
  glocke: { left: 86, top: 70, width: 12, height: 27 },
};

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
      at={AT[id]!}
      sheet={id}
      glow={p.glow === id || p.spotlight === id}
      onOpen={() => p.onOpen(id)}
      {...extra}
    >
      {bild}
    </DeskObject>
  );

  return (
    <div className={`schreibtisch${erschoepft ? ' erschoepft' : ''}${krank ? ' krank' : ''}`}>
      {p.topBar}
      <div className="szene">
        <div className="wand" aria-hidden="true" />
        <div className="tisch" aria-hidden="true" />

        {/* Wand */}
        <DeskObject
          id="karte"
          name="Wandkarte"
          shortcut="K"
          at={AT.karte}
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
        <div className="lampe" aria-hidden="true" style={{ left: '45%', top: '8%', width: '6%', height: '26%' }}>
          <LampShape />
        </div>
        {obj(
          'termine',
          'Kalender',
          // Feste Termine kommen jede Runde wieder – kein „neu“, und ein eigenes Wort, damit
          // sie nicht mit den freien Terminen oben in der Leiste verwechselt werden (0.2.15+12).
          { status: badges.termine.count > 0 ? `${badges.termine.count} feste${badges.termine.count === 1 ? 'r' : ''} Termin${badges.termine.count === 1 ? '' : 'e'}` : undefined },
          <span className="kalenderblatt">
            <span className="kalender-band" />
            <span className="kalender-zeit">{formatDate(game)}</span>
            <span className="kalender-runde">
              Runde {game.round}
              <small>von {game.totalRounds}</small>
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
          at={AT.tuer}
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
        <div className={p.spotlight === 'ruth' ? 'unterlage-platz rundgang-ziel' : 'unterlage-platz'} style={{ left: '45%', top: '47%', width: '26%', height: '36%' }}>
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
          { badge: game.bankruptcyDeadline > 0 ? { text: `Runde ${game.bankruptcyDeadline}`, urgent: true } : null, status: `Rating ${game.rating}` },
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
        {obj('protokoll', 'Kladde', { status: p.saved ? '✓ gesichert' : undefined }, <NotebookShape />)}
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
