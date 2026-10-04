// Reiter in einem Fenster (0.2.15+9): Pfeiltasten wechseln, der zuletzt benutzte
// Reiter bleibt je Fenster gemerkt (localStorage über storage.ts).

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { readPref, writePref } from '../storage';

export interface TabDef {
  id: string;
  label: string;
  /** Kleiner Zusatz am Reiter, z. B. eine Zahl. */
  badge?: string;
}

function prefName(sheet: string): string {
  return `crude.reiter.${sheet}`;
}

/** Der Reiter, der gilt: der verlangte, sonst der zuletzt benutzte, sonst der erste. */
export function activeTab(sheet: string, tabs: readonly TabDef[], wanted: string | undefined): string {
  const gibt = (id: string | null | undefined): id is string => !!id && tabs.some((t) => t.id === id);
  if (gibt(wanted)) return wanted;
  const gemerkt = readPref(prefName(sheet));
  return gibt(gemerkt) ? gemerkt : tabs[0].id;
}

export function Tabs({
  sheet,
  tabs,
  active,
  onChange,
  children,
}: {
  sheet: string;
  tabs: readonly TabDef[];
  active: string;
  onChange: (tab: string) => void;
  children: ReactNode;
}) {
  const basis = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function waehle(id: string, fokus: boolean) {
    writePref(prefName(sheet), id);
    onChange(id);
    if (fokus) refs.current[id]?.focus();
  }

  function tasten(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    let j: number | null = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j === null) return;
    e.preventDefault();
    waehle(tabs[j].id, true);
  }

  return (
    <>
      <div className="reiter" role="tablist" onKeyDown={tasten}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${basis}-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`${basis}-inhalt`}
            tabIndex={t.id === active ? 0 : -1}
            className={t.id === active ? 'aktiv' : undefined}
            onClick={() => waehle(t.id, false)}
          >
            {t.label}
            {t.badge && <span className="reiter-zahl"> {t.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${basis}-inhalt`} aria-labelledby={`${basis}-${active}`} className="reiter-inhalt">
        {children}
      </div>
    </>
  );
}
