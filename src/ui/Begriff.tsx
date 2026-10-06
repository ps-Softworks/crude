// Ein Fachbegriff im Text (0.4.20+42): gepunktet unterstrichen, beim Darüberfahren oder Fokussieren
// erscheint die Kurzerklärung aus content/glossar.yaml. Ohne Kinder steht der Begriff selbst da.

import { useId, type ReactNode } from 'react';
import { localize } from '../sim/i18n';
import { glossaryEntry } from './glossary';
import './begriff.css';

export function Begriff({ id, children }: { id: string; children?: ReactNode }) {
  const tipId = useId();
  const eintrag = glossaryEntry(id);
  if (!eintrag) return <>{children}</>;
  return (
    <span className="begriff" tabIndex={0} aria-describedby={tipId}>
      {children ?? localize(eintrag.term)}
      <span id={tipId} role="tooltip" className="begriff-tipp">
        <strong>{localize(eintrag.term)}</strong> – {localize(eintrag.text)}
      </span>
    </span>
  );
}
