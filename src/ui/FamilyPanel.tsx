// Die Familie (2.7, GDD §12): Ruth und – nach der Geburt – Thomas, jeweils mit
// Zustandswort und einem Satz, dazu was zu Hause über Jacob gesagt wird. Kraft
// und Beziehung sind nie als Zahl sichtbar. Was gilt, entscheidet src/sim.

import { familyView } from '../sim/family';
import type { GameState } from '../sim/game';
import { balance } from './balance';
import { familyContent } from './family';
import { Silhouette } from './Silhouette';

export function FamilyPanel({ game, debug }: { game: GameState; debug: boolean }) {
  const f = familyView(game, balance, familyContent);
  return (
    <section className={f.sick ? 'familie krank' : 'familie'} aria-label="Familie">
      <h2>Familie</h2>
      <ul>
        {f.members.map((m) => (
          <li key={m.id}>
            <Silhouette id={m.id} name={m.name} size={44} />
            <span>
              <strong>{m.name}</strong> – <span className={`zustand ${m.word}`}>{m.wordText}</span>. {m.text}
              {debug && <span className="muted"> (Beziehung {game.family[m.id]})</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="jacob">{f.jacob}</p>
    </section>
  );
}
