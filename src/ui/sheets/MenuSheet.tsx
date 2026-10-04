// Fenster „Menü“ (☰ in der Kopfleiste; die Schublade bleibt fürs Schattenbuch frei): Neues Spiel, Feedback, Einstiegshilfe,
// Zeitung, Rundgang, Tastenhilfe – und mit Debug-Bereich (?debug=1) der Reiter „Debug“.

import { FeedbackLink } from '../FeedbackLink';
import { keyLabel, SHORTCUTS } from '../keys';
import { Tabs, activeTab } from '../sheet/Tabs';
import { tester } from '../tester';
import type { SheetContext } from './types';
// 4.6 Andockpunkt: Raffinerie im Debug-Reiter freischalten.
import { unlockRefinery } from '../../sim/refinery';
import { balance } from '../balance';
import { rt } from '../refinery';

export interface MenuProps {
  ctx: SheetContext;
  seed: string;
  tutorialOn: boolean;
  onTutorial: (on: boolean) => void;
  autoNewspaper: boolean;
  onAutoNewspaper: (on: boolean) => void;
  /** Rundgang über den Schreibtisch noch einmal zeigen (0.2.15+10). */
  onTour: () => void;
  onRestart: () => void;
  onDebug: (debug: boolean) => void;
  onSeed: (seed: string) => void;
  onNewWorld: () => void;
  onRandomWorld: () => void;
  onForget: () => void;
}

/** Weltmodell (4.1) als Zahlen – nur im Debug-Reiter; im Spiel deutet nur die Zeitung an. */
function WorldDebug({ ctx }: { ctx: SheetContext }) {
  const w = ctx.game.worldModel;
  if (!w) return null;
  const z = (x: number, st = 0) => x.toLocaleString('de-DE', { minimumFractionDigits: st, maximumFractionDigits: st });
  const PARTEI = { handel: 'Handelspartei', volksbund: 'Volksbund', provinz: 'Provinzliga' };
  return (
    <dl className="terms">
      <dt>Weltpreis</dt>
      <dd>
        {z(w.price, 2)} · Nachfrage {z(w.demand, 2)} · Kapazität {z(w.capacity, 2)} · Lager {z(w.stock, 2)}
      </dd>
      <dt>Kreditklima</dt>
      <dd>
        {z(w.credit)}
        {w.crash > 0 ? ` · Crash noch ${w.crash} Runden` : ''}
      </dd>
      <dt>Stimmung</dt>
      <dd>{z(w.mood)}</dd>
      <dt>Politik</dt>
      <dd>
        {PARTEI[w.government]} regiert · Wahl in {w.electionIn} Runden · H {z(w.parties.handel * 100)} % / V {z(w.parties.volksbund * 100)} % / P{' '}
        {z(w.parties.provinz * 100)} %
      </dd>
      <dt>Außenspannung</dt>
      <dd>
        {z(w.tension)}
        {w.war > 0 ? ` · Krieg noch ${w.war} Runden` : ''}
      </dd>
      <dt>Technik / Nationalismus</dt>
      <dd>
        {z(w.tech)} / {z(w.nationalism)}
      </dd>
    </dl>
  );
}

/** Die Tastenhilfe – aus denselben Daten wie die Kürzel selbst. */
export function KeyHelp({ debugTools }: { debugTools: boolean }) {
  return (
    <>
      <dl className="tastenhilfe">
        {SHORTCUTS.filter((s) => !s.debugOnly || debugTools).map((s) => (
          <div key={`${s.shift ? 'S' : ''}${s.key}`}>
            <dt>
              <kbd>{keyLabel(s)}</kbd>
            </dt>
            <dd>{s.label}</dd>
          </div>
        ))}
        <div>
          <dt>
            <kbd>1</kbd>–<kbd>4</kbd>
          </dt>
          <dd>Antwort im Brief, Vorfall, Termin oder beim Besuch wählen</dd>
        </div>
        <div>
          <dt>
            <kbd>Esc</kbd>
          </dt>
          <dd>Besuch warten lassen · Fenster schließen · Ranch-Fenster schließen · Karte zurück zur Startansicht · zurück zum Schreibtisch</dd>
        </div>
        <div>
          <dt>
            <kbd>Tab</kbd> <kbd>Enter</kbd>
          </dt>
          <dd>Von Gegenstand zu Gegenstand, öffnen</dd>
        </div>
      </dl>
      <p className="muted klein">Kürzel gelten am Schreibtisch, solange kein Fenster offen ist und kein Eingabefeld oder Regler den Fokus hat.</p>
    </>
  );
}

export function MenuSheet(p: MenuProps) {
  const { ctx } = p;
  const tabs = [
    { id: 'spiel', label: 'Spiel' },
    { id: 'tasten', label: 'Tasten' },
    ...(ctx.debugTools ? [{ id: 'debug', label: 'Debug' }] : []),
  ];
  const tab = activeTab('menu', tabs, ctx.tab);
  return (
    <Tabs sheet="menu" tabs={tabs} active={tab} onChange={ctx.onTab}>
      {tab === 'spiel' && (
        <div className="menue">
          <p>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Neues Spiel beginnen? Der aktuelle Stand geht verloren.')) p.onRestart();
              }}
            >
              Neues Spiel
            </button>
          </p>
          <label>
            <input type="checkbox" checked={p.tutorialOn} onChange={(e) => p.onTutorial(e.target.checked)} /> Einstiegshilfe (Ruths Zettel
            führt durch die ersten Runden)
          </label>
          <p>
            <button type="button" onClick={p.onTour}>
              Rundgang über den Schreibtisch zeigen
            </button>
          </p>
          <label>
            <input type="checkbox" checked={p.autoNewspaper} onChange={(e) => p.onAutoNewspaper(e.target.checked)} /> Zeitung zu
            Rundenbeginn von selbst aufschlagen
          </label>
          {tester.feedbackUrl !== null && (
            <p>
              Testversion – sag uns, was hakt: <FeedbackLink className="feedback gross" />
            </p>
          )}
          <p className="muted klein">Der Spielstand wird nach jeder Aktion von selbst gesichert.</p>
        </div>
      )}
      {tab === 'tasten' && <KeyHelp debugTools={ctx.debugTools} />}
      {tab === 'debug' && ctx.debugTools && (
        <section className="debug">
          <label>
            <input type="checkbox" checked={ctx.debug} onChange={(e) => p.onDebug(e.target.checked)} /> Verdeckte Geologie zeigen
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              p.onNewWorld();
            }}
          >
            <label>
              Seed <input value={p.seed} onChange={(e) => p.onSeed(e.target.value)} />
            </label>
            <button type="submit">Welt laden</button>
            <button type="button" onClick={p.onRandomWorld}>
              Zufällige Welt
            </button>
            <button type="button" onClick={p.onForget}>
              Spielstand löschen
            </button>
          </form>
          <WorldDebug ctx={ctx} />
          {/* 4.6 Andockpunkt: Raffinerie vorab ansehen, bis es Kapitel 2 gibt (4.5). */}
          {!ctx.game.refinery && (
            <button type="button" onClick={() => ctx.onGame(unlockRefinery(ctx.game, balance))}>
              {rt('hints.unlockDebug')}
            </button>
          )}
        </section>
      )}
    </Tabs>
  );
}
