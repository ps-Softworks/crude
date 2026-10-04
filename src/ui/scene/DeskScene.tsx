// Der Schreibtisch als Szene (0.2.15+9): ein Bild, kein Scrollen. Oben die Wand
// mit Wandkarte, Pinnwand, Kalender, Familienfoto und Tür, darunter der Tisch
// mit Zeitung, Briefen, Notizspieß, Ruths Zettel, Kassenbuch, Akte, Fracht,
// Kladde, Schublade und Glocke. Jeder Gegenstand ist ein Knopf und öffnet ein
// Fenster. Zahlen und Abzeichen sind nur gezählt – entschieden wird in src/sim.

import type { ReactNode } from 'react';
import { agendaView } from '../../sim/agenda';
import type { NextStep } from '../../sim/desk';
import { familyView } from '../../sim/family';
import { formatDate, type GameState } from '../../sim/game';
import { storageCapacity } from '../../sim/logistics';
import { makeNewspaper } from '../../sim/newspaper';
import { rigReady, rigWell } from '../../sim/rigs';
import type { TutorialView } from '../../sim/tutorial';
import { balance } from '../balance';
import { familyContent } from '../family';
import { barrels } from '../format';
import type { InboxBadges } from '../inbox';
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

/** Wo was liegt, in Prozent der Bühne (unter der Kopfleiste). */
const AT: Record<SheetId | 'karte' | 'tuer', Placement> = {
  karte: { left: 2, top: 4, width: 22, height: 34 },
  konkurrenz: { left: 26, top: 6, width: 15, height: 28 },
  termine: { left: 64.5, top: 4, width: 9.5, height: 30 },
  familie: { left: 75.5, top: 6, width: 8.5, height: 28 },
  tuer: { left: 86, top: 0, width: 12, height: 42 },
  zeitung: { left: 2.5, top: 48, width: 15, height: 24 },
  post: { left: 19, top: 47, width: 13, height: 25 },
  vorfaelle: { left: 33.5, top: 46, width: 8.5, height: 26 },
  kassenbuch: { left: 73, top: 47, width: 12, height: 25 },
  akte: { left: 3, top: 75, width: 14, height: 22 },
  fracht: { left: 19, top: 75, width: 15, height: 22 },
  protokoll: { left: 36, top: 76, width: 9, height: 21 },
  menu: { left: 51, top: 86, width: 15, height: 12 },
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
  const familie = familyView(game, balance, familyContent);
  const zeitung = game.finished ? null : makeNewspaper(game, balance, newspaperContent);

  // Akte: nur zählen, was die Türme gerade tun.
  const bohren = game.rigs.filter((r) => rigWell(game, r.id)).length;
  const frei = game.rigs.filter((r) => rigReady(game, r) && !rigWell(game, r.id)).length;
  const warten = game.wells.filter((w) => w.status === 'decision' || w.status === 'stuck').length;

  // Fracht: Füllstand des Tanks gegen die Lagergrenze, nur als Anteil.
  const kapazitaet = storageCapacity(game, balance);
  const fuellung = kapazitaet > 0 ? Math.min(1, game.oilStock / kapazitaet) : 0;

  const leases = game.leases.filter((l) => l.holder === 'jacob').length;
  const options = game.options.filter((o) => o.holder === 'jacob').length;

  // Familienfoto: je kälter das Wort, desto blasser das Bild (nur Wörter, keine Zahl).
  const RANG = { content: 0, neglected: 1, bitter: 2, estranged: 3 } as const;
  const kaelteste = familie.members.reduce<keyof typeof RANG>((w, m) => (RANG[m.word] > RANG[w] ? m.word : w), 'content');

  const obj = (id: SheetId, name: string, extra: Partial<Parameters<typeof DeskObject>[0]>, bild: ReactNode) => (
    <DeskObject
      id={id}
      name={name}
      shortcut={keyForSheet(id)}
      at={AT[id]}
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
          { badge: badges.termine.count > 0 ? { text: `${badges.termine.count} Termin${badges.termine.count === 1 ? '' : 'e'}` } : null, fresh: badges.termine.fresh },
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
            <span className="foto-figur">
              <Silhouette id="ruth" name="Ruth" size={46} />
            </span>
          </span>,
        )}
        <Door
          at={AT.tuer}
          names={p.waiting.names}
          figure={p.waiting.figure}
          urgent={badges.tuer.urgent}
          knock={p.knock}
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
        <div className={p.spotlight === 'ruth' ? 'unterlage-platz rundgang-ziel' : 'unterlage-platz'} style={{ left: '44%', top: '45%', width: '27%', height: '38%' }}>
          <RuthNote
            step={p.step}
            tutorial={p.tutorial}
            sickRounds={zeit.sickRounds}
            exhausted={zeit.exhausted}
            finished={game.finished}
            tutorialOffer={p.tutorialOffer}
            onGo={p.onRuth}
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
            status: `${bohren} bohr${bohren === 1 ? 't' : 'en'} · ${frei} frei`,
            badge: warten > 0 ? { text: `${warten} wartet` } : null,
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
        {obj('menu', 'Schublade · Menü', {}, <DrawerShape />)}
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
