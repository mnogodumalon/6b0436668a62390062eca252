import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
/** A raw record URL (applookup reference). NEVER render this directly
 *  in JSX — it is a URL, not a display value. Show the enriched `*Name`
 *  field or resolve it via the entity map instead. Assignable to/from
 *  string everywhere; the `& {}` keeps the alias NAME visible in tsc
 *  error messages (a plain primitive alias gets normalized away). */
export type RecordUrl = string & {};
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Gerichte {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    gericht_name?: string;
    kategorie?: LookupValue;
    zubereitungszeit?: number;
    portionen?: number;
    zutaten?: string;
    zubereitung?: string;
  };
}

export interface Kochtagebuch {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    gericht?: RecordUrl; // applookup -> URL zu 'Gerichte' Record
    gekocht_am?: string; // Format: YYYY-MM-DD oder ISO String
    geklappt?: boolean;
    bewertung?: LookupValue;
    tatsaechliche_dauer?: number;
    anmerkungen?: string;
  };
}

export interface Einkaufsplanung {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    bezeichnung?: string;
    einkaufsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    gerichte?: RecordUrl[];
    zusaetzliche_artikel?: string;
    erledigt?: boolean;
  };
}

export const APP_IDS = {
  GERICHTE: '6b0436577c18d9512b47a875',
  KOCHTAGEBUCH: '6b04365a6833980e2ffa47af',
  EINKAUFSPLANUNG: '6b04365bc90a38021b1c458c',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'gerichte': {
    kategorie: [{ key: "nudeln_reis", get label() { return lookupLabel('gerichte', 'kategorie', "nudeln_reis") ?? "Nudeln und Reis"; } }, { key: "suppe_eintopf", get label() { return lookupLabel('gerichte', 'kategorie', "suppe_eintopf") ?? "Suppe und Eintopf"; } }, { key: "salat", get label() { return lookupLabel('gerichte', 'kategorie', "salat") ?? "Salat"; } }, { key: "fleisch_fisch", get label() { return lookupLabel('gerichte', 'kategorie', "fleisch_fisch") ?? "Fleisch und Fisch"; } }, { key: "vegetarisch", get label() { return lookupLabel('gerichte', 'kategorie', "vegetarisch") ?? "Vegetarisch"; } }, { key: "snack", get label() { return lookupLabel('gerichte', 'kategorie', "snack") ?? "Snack und Kleinigkeit"; } }, { key: "sonstiges", get label() { return lookupLabel('gerichte', 'kategorie', "sonstiges") ?? "Sonstiges"; } }],
  },
  'kochtagebuch': {
    bewertung: [{ key: "bewertung_1", get label() { return lookupLabel('kochtagebuch', 'bewertung', "bewertung_1") ?? "Schlecht"; } }, { key: "bewertung_2", get label() { return lookupLabel('kochtagebuch', 'bewertung', "bewertung_2") ?? "Geht so"; } }, { key: "bewertung_3", get label() { return lookupLabel('kochtagebuch', 'bewertung', "bewertung_3") ?? "Gut"; } }, { key: "bewertung_4", get label() { return lookupLabel('kochtagebuch', 'bewertung', "bewertung_4") ?? "Sehr gut"; } }, { key: "bewertung_5", get label() { return lookupLabel('kochtagebuch', 'bewertung', "bewertung_5") ?? "Ausgezeichnet"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'gerichte': {
    'gericht_name': 'string/text',
    'kategorie': 'lookup/select',
    'zubereitungszeit': 'number',
    'portionen': 'number',
    'zutaten': 'string/textarea',
    'zubereitung': 'string/textarea',
  },
  'kochtagebuch': {
    'gericht': 'applookup/select',
    'gekocht_am': 'date/date',
    'geklappt': 'bool',
    'bewertung': 'lookup/radio',
    'tatsaechliche_dauer': 'number',
    'anmerkungen': 'string/textarea',
  },
  'einkaufsplanung': {
    'bezeichnung': 'string/text',
    'einkaufsdatum': 'date/date',
    'gerichte': 'multipleapplookup/select',
    'zusaetzliche_artikel': 'string/textarea',
    'erledigt': 'bool',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateGerichte = StripLookup<Gerichte['fields']>;
export type CreateKochtagebuch = StripLookup<Kochtagebuch['fields']>;
export type CreateEinkaufsplanung = StripLookup<Einkaufsplanung['fields']>;