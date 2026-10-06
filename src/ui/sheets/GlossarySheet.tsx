// Fenster „Glossar“ (0.4.20+42): Begriffe alphabetisch, mit Suche.

import { useState } from 'react';
import { localize } from '../../sim/i18n';
import { searchGlossary } from '../../sim/glossary';
import { glossary, glossaryEntry } from '../glossary';
import '../begriff.css';

export function GlossarySheet() {
  const [query, setQuery] = useState('');
  const treffer = searchGlossary(glossary, query);
  return (
    <div className="glossar">
      <input
        type="search"
        className="glossar-suche"
        placeholder="Begriff suchen …"
        aria-label="Glossar durchsuchen"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {treffer.length === 0 ? (
        <p className="muted">Dazu steht nichts im Glossar.</p>
      ) : (
        <dl className="glossar-liste">
          {treffer.map((e) => (
            <div key={e.id}>
              <dt id={`begriff-${e.id}`}>{localize(e.term)}</dt>
              <dd>
                {localize(e.text)}
                {e.see.length > 0 && (
                  <span className="glossar-siehe">Siehe auch: {e.see.map((s) => (glossaryEntry(s) ? localize(glossaryEntry(s)!.term) : s)).join(', ')}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
