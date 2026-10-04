// Personal (4.9): Texte aus content/staff.yaml und die Ansicht für die
// Personalakten. Hier wird nur gelesen und zusammengestellt – die Regeln
// stehen in staff.ts und staffRound.ts. Die Oberfläche zeigt nur, was hier
// herauskommt: Kompetenz als Spanne, Loyalität und Hitze als Wort.

import { parseDocument } from 'yaml';
import type { Balance } from './balance';
import type { ContentError } from './eventContent';
import type { GameState } from './game';
import { DEFAULT_LANG, LANGUAGES, localize, type Lang, type LocalizedText } from './i18n';
import {
  competenceShown,
  FIXER_ORDERS,
  HEAT_WORDS,
  heatWord,
  LOYALTY_WORDS,
  loyaltyWord,
  MAIL_RULES,
  orderSuccess,
  STAFF_ROLES,
  STAFF_TRAITS,
  wageOf,
  type FixerOrder,
  type HeatWord,
  type LoyaltyWord,
  type MailRule,
  type StaffPerson,
  type StaffRole,
  type StaffTrait,
} from './staff';

interface Benannt {
  label: LocalizedText;
  text: LocalizedText;
}

export interface StaffName {
  name: string;
  text: LocalizedText;
}

export interface StaffContent {
  roles: Record<StaffRole, { title: LocalizedText; text: LocalizedText }>;
  traits: Record<StaffTrait, Benannt>;
  loyalty: Record<LoyaltyWord, LocalizedText>;
  heat: Record<HeatWord, Benannt>;
  orders: Record<FixerOrder, Benannt>;
  intel: LocalizedText;
  policies: { mail: Record<MailRule, LocalizedText>; wage: Record<string, LocalizedText> };
  names: Record<StaffRole, StaffName[]>;
}

function istObjekt(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liest content/staff.yaml. Fehlt etwas, kommt es als Fehler zurück (content ist dann null). */
export function parseStaffContent(file: string, text: string): { content: StaffContent | null; errors: ContentError[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  const errors: ContentError[] = [];
  const fehler = (message: string, line = 1) => errors.push({ file, line, message });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) fehler(`YAML kaputt: ${e.message.split('\n')[0]}`, e.linePos?.[0]?.line ?? 1);
    return { content: null, errors };
  }
  const raw: unknown = doc.toJS();
  if (!istObjekt(raw)) {
    fehler('Die Datei braucht „roles“, „traits“, „loyalty“, „heat“, „orders“, „intel“, „policies“ und „names“.');
    return { content: null, errors };
  }

  function sprachtext(value: unknown, wo: string): LocalizedText {
    if (!istObjekt(value)) {
      fehler(`${wo}: braucht Sprachschlüssel ${LANGUAGES.join('/')}.`);
      return { de: '', en: '' };
    }
    const unbekannt = Object.keys(value).filter((k) => !(LANGUAGES as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`${wo}: unbekannte Sprache ${unbekannt.join(', ')}.`);
    if (typeof value.de !== 'string' || value.de.trim() === '') fehler(`${wo}: deutscher Text fehlt.`);
    if (value.en !== undefined && typeof value.en !== 'string') fehler(`${wo}: englischer Text muss Text sein.`);
    return { de: typeof value.de === 'string' ? value.de : '', en: typeof value.en === 'string' ? value.en : '' };
  }

  function block<K extends string, T>(value: unknown, wo: string, ids: readonly K[], lesen: (v: unknown, wo: string) => T): Record<K, T> {
    const out = {} as Record<K, T>;
    if (!istObjekt(value)) {
      fehler(`„${wo}“ fehlt.`);
      return out;
    }
    const unbekannt = Object.keys(value).filter((k) => !(ids as readonly string[]).includes(k));
    if (unbekannt.length > 0) fehler(`„${wo}“: unbekannte Einträge ${unbekannt.join(', ')}. Erlaubt: ${ids.join(', ')}.`);
    for (const id of ids) out[id] = lesen(value[id], `${wo}.${id}`);
    return out;
  }

  const benannt = (v: unknown, wo: string): Benannt => ({
    label: sprachtext(istObjekt(v) ? v.label : undefined, `${wo}.label`),
    text: sprachtext(istObjekt(v) ? v.text : undefined, `${wo}.text`),
  });

  const roles = block(raw.roles, 'roles', STAFF_ROLES, (v, wo) => ({
    title: sprachtext(istObjekt(v) ? v.title : undefined, `${wo}.title`),
    text: sprachtext(istObjekt(v) ? v.text : undefined, `${wo}.text`),
  }));
  const traits = block(raw.traits, 'traits', STAFF_TRAITS, benannt);
  const loyalty = block(raw.loyalty, 'loyalty', LOYALTY_WORDS, sprachtext);
  const heat = block(raw.heat, 'heat', HEAT_WORDS, benannt);
  const orders = block(raw.orders, 'orders', FIXER_ORDERS, benannt);
  const intel = sprachtext(raw.intel, 'intel');
  const pol = istObjekt(raw.policies) ? raw.policies : {};
  if (!istObjekt(raw.policies)) fehler('„policies“ fehlt.');
  const mail = block(pol.mail, 'policies.mail', MAIL_RULES, sprachtext);
  const wage: Record<string, LocalizedText> = {};
  if (!istObjekt(pol.wage)) fehler('„policies.wage“ fehlt.');
  else for (const [k, v] of Object.entries(pol.wage)) wage[k] = sprachtext(v, `policies.wage.${k}`);
  const names = block(raw.names, 'names', STAFF_ROLES, (v, wo) => {
    if (!Array.isArray(v) || v.length === 0) {
      fehler(`„${wo}“: braucht eine Liste mit Namen.`);
      return [];
    }
    return v.map((n, i) => {
      const name = istObjekt(n) && typeof n.name === 'string' && n.name.trim() !== '' ? n.name : '';
      if (name === '') fehler(`${wo}[${i + 1}]: „name“ fehlt.`);
      return { name, text: sprachtext(istObjekt(n) ? n.text : undefined, `${wo}[${i + 1}].text`) };
    });
  });
  if (errors.length > 0) return { content: null, errors };
  return { content: { roles, traits, loyalty, heat, orders, intel, policies: { mail, wage }, names }, errors };
}

/** Passen Inhalt und Spielzahlen zusammen? Je Stelle genau staff.namePool Namen, jede Lohnstufe mit Text. */
export function checkStaffContent(file: string, content: StaffContent, balance: Balance): ContentError[] {
  const errors: ContentError[] = [];
  for (const role of STAFF_ROLES) {
    if (content.names[role].length !== balance.staff.namePool) {
      errors.push({ file, line: 1, message: `names.${role}: ${content.names[role].length} Namen, balance.yaml staff.namePool verlangt ${balance.staff.namePool}.` });
    }
  }
  for (const l of balance.staff.wage.levels) {
    if (!content.policies.wage[l.id]) errors.push({ file, line: 1, message: `policies.wage.${l.id} fehlt (Lohnstufe aus balance.yaml).` });
  }
  return errors;
}

// --- Ansicht ------------------------------------------------------------------------

export interface StaffTraitView {
  id: StaffTrait;
  label: string;
  text: string;
}

export interface StaffPersonView {
  role: StaffRole;
  roleTitle: string;
  name: string;
  /** Herkunft aus content/staff.yaml. */
  bio: string;
  /** Kompetenz, so weit Jacob sie kennt: „3–5“ oder „4“. */
  competence: string;
  /** Kompetenz genau bekannt (nach staff.revealRounds Runden im Dienst). */
  competenceKnown: boolean;
  traits: StaffTraitView[];
  /** Lohn je Runde in $ nach der aktuellen Lohnstufe. */
  wage: number;
}

export interface StaffMemberView extends StaffPersonView {
  loyalty: LoyaltyWord;
  loyaltyText: string;
  /** Personalakte: Trefferbilanz. */
  good: number;
  bad: number;
  /** Runden im Dienst. */
  rounds: number;
  /** Fällt in dieser Runde aus (Trinker). */
  drunk: boolean;
  /** Anerkennung in dieser Runde schon gegeben. */
  recognized: boolean;
}

export interface FixerOrderView {
  id: FixerOrder;
  label: string;
  text: string;
  cost: number;
  /** Erfolgschance in ganzen Prozent – nur, wenn die Kompetenz genau bekannt ist. */
  chance: number | null;
  /** In dieser Runde schon in Auftrag. */
  ordered: boolean;
}

export interface StaffView {
  members: StaffMemberView[];
  /** Bewerber mit ihrem Index in state.staff.candidates (für hireStaff). */
  candidates: (StaffPersonView & { index: number })[];
  /** Freie Stellen ohne Bewerber. */
  vacant: StaffRole[];
  heat: HeatWord;
  heatLabel: string;
  heatText: string;
  orders: FixerOrderView[];
  intel: string | null;
  intelRound: number | null;
  journal: string[];
  /** Löhne je Runde zusammen. */
  payroll: number;
}

function personView(p: StaffPerson, state: GameState, balance: Balance, content: StaffContent, lang: Lang): StaffPersonView {
  const k = competenceShown(p, state, balance);
  const name = content.names[p.role][p.name] ?? { name: '?', text: { de: '', en: '' } };
  return {
    role: p.role,
    roleTitle: localize(content.roles[p.role].title, lang),
    name: name.name,
    bio: localize(name.text, lang),
    competence: k.min === k.max ? String(k.min) : `${k.min}–${k.max}`,
    competenceKnown: k.min === k.max,
    traits: p.traits.map((t) => ({ id: t, label: localize(content.traits[t].label, lang), text: localize(content.traits[t].text, lang) })),
    wage: wageOf(p, state, balance),
  };
}

/** Was die Personalakten zeigen. null ohne Personal (Kapitel 1). */
export function staffView(state: GameState, balance: Balance, content: StaffContent, lang: Lang = DEFAULT_LANG): StaffView | null {
  const staff = state.staff;
  if (!staff) return null;
  const members = staff.hired.map((m) => {
    const word = loyaltyWord(m.loyalty, balance);
    return {
      ...personView(m, state, balance, content, lang),
      loyalty: word,
      loyaltyText: localize(content.loyalty[word], lang),
      good: m.good,
      bad: m.bad,
      rounds: state.round - m.hiredRound,
      drunk: staff.drunk.includes(m.role),
      recognized: staff.recognized.includes(m.role),
    };
  });
  const fixer = staff.hired.find((m) => m.role === 'fixer');
  const fixerKnown = fixer ? competenceShown(fixer, state, balance).min === fixer.competence && competenceShown(fixer, state, balance).max === fixer.competence : false;
  const word = heatWord(staff.heat, balance);
  const intel = staff.intel;
  return {
    members,
    candidates: staff.candidates.map((c, index) => ({ ...personView(c, state, balance, content, lang), index })),
    vacant: STAFF_ROLES.filter((r) => !staff.hired.some((m) => m.role === r) && !staff.candidates.some((c) => c.role === r)),
    heat: word,
    heatLabel: localize(content.heat[word].label, lang),
    heatText: localize(content.heat[word].text, lang),
    orders: fixer
      ? FIXER_ORDERS.map((id) => ({
          id,
          label: localize(content.orders[id].label, lang),
          text: localize(content.orders[id].text, lang),
          cost: balance.staff.fixer.orders[id].cost,
          chance: fixerKnown ? Math.round(orderSuccess(id, fixer.competence, balance) * 100) : null,
          ordered: staff.orders.includes(id),
        }))
      : [],
    intel: intel
      ? localize(content.intel, lang)
          .replace('{cash}', intel.cash.toLocaleString('de-DE'))
          .replace('{drilling}', String(intel.drilling))
          .replace('{found}', String(intel.found))
          .replace('{leases}', String(intel.leases))
      : null,
    intelRound: intel?.round ?? null,
    journal: [...staff.journal].reverse(),
    payroll: staff.hired.reduce((s, m) => s + wageOf(m, state, balance), 0),
  };
}
