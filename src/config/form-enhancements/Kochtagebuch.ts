// Auto-generated. Per-entity form-enhancements config for "Kochtagebuch".
// Written by the backend form polish (app/services/form_polish.py) from the
// generator's manifest; scripts/parse-formulas.mjs expands the formula strings.
// Schema: see ./types.ts.

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ["gericht", "gekocht_am", {"row": ["bewertung", "tatsaechliche_dauer"], "cols": "2fr 1fr"}, "geklappt", "anmerkungen"],
  defaults: {
    'gekocht_am': { kind: 'today' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
