import { useState } from 'react';
import { endRound, formatDate, newGame } from '../sim/game';
import { balance } from './balance';
import { Map } from './Map';

const GEOLOGY_LABEL = { dry: 'trocken', small: 'klein', gusher: 'Gusher' } as const;

function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

// Für Tests und Fehlersuche: ?seed=abc&debug=1 in der Adresse.
const params = new URLSearchParams(window.location.search);

export function App() {
  const [seedInput, setSeedInput] = useState(() => params.get('seed') ?? randomSeed());
  const [game, setGame] = useState(() => newGame(seedInput, balance));
  const [debug, setDebug] = useState(params.get('debug') === '1');
  const [selected, setSelected] = useState<string | null>(null);

  const parcel = game.parcels.find((p) => p.id === selected);

  function startNewWorld(seed: string) {
    setSeedInput(seed);
    setGame(newGame(seed, balance));
    setSelected(null);
  }

  return (
    <div className="app">
      <header>
        <h1>CRUDE</h1>
        <div className="status">
          <span>
            Runde {game.round}/{game.totalRounds}
          </span>
          <span>{formatDate(game)}</span>
          <span>Kasse: {game.cash.toLocaleString('de-DE')} $</span>
        </div>
      </header>

      <main>
        <Map balance={balance} parcels={game.parcels} debug={debug} selected={selected} onSelect={setSelected} />

        <aside>
          <section>
            <button className="primary" disabled={game.finished} onClick={() => setGame(endRound(game))}>
              {game.finished ? 'Kapitel beendet' : 'Runde beenden'}
            </button>
          </section>

          <section>
            <h2>Parzelle</h2>
            {parcel ? (
              <p>
                {parcel.x + 1}/{parcel.y + 1} · Zone {parcel.zone}
                {debug && (
                  <>
                    <br />
                    Geologie: {GEOLOGY_LABEL[parcel.geology]}, {parcel.reserves.toLocaleString('de-DE')} Barrel
                  </>
                )}
              </p>
            ) : (
              <p className="muted">Klick auf ein Feld der Karte.</p>
            )}
          </section>

          <section>
            <h2>Protokoll</h2>
            <ul className="log">
              {[...game.log].reverse().map((line, i) => (
                <li key={game.log.length - i}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="debug">
            <h2>Debug</h2>
            <label>
              <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Verdeckte
              Geologie zeigen
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                startNewWorld(seedInput);
              }}
            >
              <label>
                Seed <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} />
              </label>
              <button type="submit">Welt laden</button>
              <button type="button" onClick={() => startNewWorld(randomSeed())}>
                Zufällige Welt
              </button>
            </form>
          </section>
        </aside>
      </main>
    </div>
  );
}
