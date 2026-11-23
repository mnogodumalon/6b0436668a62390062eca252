// Auto-generated. Per-entity form-enhancements config for "Einkaufsplanung".
// Written by the backend form polish (app/services/form_polish.py) from the
// generator's manifest; scripts/parse-formulas.mjs expands the formula strings.
// Schema: see ./types.ts.

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ["bezeichnung", "gerichte", {"row": ["einkaufsdatum", "erledigt"], "cols": "2fr 1fr"}, "zusaetzliche_artikel"],
  defaults: {
    'einkaufsdatum': { kind: 'today' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
