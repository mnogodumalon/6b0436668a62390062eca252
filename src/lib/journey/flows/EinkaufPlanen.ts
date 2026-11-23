/**
 * useEinkaufPlanenFlow — the plumbing of the flow « Einkauf planen », generated from the plan.
 *
 * Writes `einkaufsplanung`: asks `bezeichnung`, `einkaufsdatum`, `gerichte`, `zusaetzliche_artikel`; sets `erledigt` itself.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 3)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   const flow = useEinkaufPlanenFlow({
 *     steps: { gerichte: 1, bezeichnung: 2, einkaufsdatum: 2, zusaetzliche_artikel: 2 },
 *     items: { gerichte: r => ({ id: r.id, title: fieldText(r, 'gericht_name') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <EntitySelectStep {...flow.picks.gerichte.select} {...flow.pickMany('gerichte')} />
 *     <Bound form={flow.forms.einkaufsplanung} name="bezeichnung" />
 *     <Bound form={flow.forms.einkaufsplanung} name="einkaufsdatum" />
 *     <Bound form={flow.forms.einkaufsplanung} name="zusaetzliche_artikel" />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} variants={flow.actions} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} />}
 *   </IntentWizardShell>
 */
import { useEffect, useRef, useState } from 'react';
import { readJourneyExtra, writeJourneyExtra } from '@/lib/journey/draft';
import { DOOR_PARENTS, nounOne } from '@/config/plan';
import { syncDoorsAfterWrite } from '@/lib/publicDoors';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep, type SummaryItem,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';

export type EinkaufPlanenFieldKey = 'bezeichnung' | 'einkaufsdatum' | 'gerichte' | 'zusaetzliche_artikel';

export interface EinkaufPlanenForms {
  einkaufsplanung: StepForm<'einkaufsplanung'>;
}

// Alias so the option generics stay readable.
type Key = EinkaufPlanenFieldKey;

export interface EinkaufPlanenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    gerichte?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
  /** A page-side narrowing per pick, on top of the plan's filter (J-3): the
   *  questions of the picked event, the open ones — `r => fieldRef(r, 'veranstaltung') === eventId`. */
  where?: {
    gerichte?: (record: JourneyRecord) => boolean;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"bezeichnung": 2, "einkaufsdatum": 2, "gerichte": 1, "zusaetzliche_artikel": 2};
export const EINKAUFPLANEN_REVIEW_STEP = 3;
// a label of the plan in the page's language
function labelIn(m: Record<string, string>): string {
  const l = (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'de';
  return m[l.slice(0, 2)] ?? m.de ?? Object.values(m)[0] ?? '';
}
// the ways this flow may END (plan: success.actions) — the review shows one
// button per entry, the chosen one sets these values on the primary record
const ACTION_SETS: Record<string, FormValues> = { 'speichern': {}, 'speichern-und-erledigt': {"erledigt": "true"} };

function fromPick<T>(pick: { recordOf(id: string): JourneyRecord | undefined }, form: StepForm, field: string, read: (r: JourneyRecord) => T): T | undefined {
  const id = form.get(field);
  const rec = typeof id === 'string' && id ? pick.recordOf(id) : undefined;
  return rec ? read(rec) : undefined;
}
// local calendar day — the ISO-string of a Date is UTC and flips the date in the evening (J-7)
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns T, not Partial<T>: a Record's index signature is already "maybe
// absent", and Partial<Record<string, string>> does not assign to the
// Record<string, string> useStepForm wants (tsc, live 23.09.2026 — eight
// errors, one per hook, caught only in the sandbox build).
function only<T extends Record<string, unknown>>(obj: T | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as T;
}

function hasValues(form: StepForm): boolean {
  return form.keys.some(k => !isEmptyValue(form.values[k]));
}

export function useEinkaufPlanenFlow(options: EinkaufPlanenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const variantRef = useRef<string | null>(null);   // the end action the person chose (PV-14)
  const einkaufsplanung = useStepForm('einkaufsplanung', {
    fields: ["bezeichnung", "einkaufsdatum", "gerichte", "zusaetzliche_artikel"],
    steps: only(steps, ["bezeichnung", "einkaufsdatum", "gerichte", "zusaetzliche_artikel"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["bezeichnung", "einkaufsdatum", "gerichte", "zusaetzliche_artikel"]),
    messages: only(options.messages as Record<string, string> | undefined, ["bezeichnung", "einkaufsdatum", "gerichte", "zusaetzliche_artikel"]),
  });
  const forms: EinkaufPlanenForms = { einkaufsplanung };
  // the editor of a list is not a record of its own: the review and the success
  // page read the entries (PlanStep.review), never the half-filled editor
  const formList: StepForm[] = [einkaufsplanung];
  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    gerichte: useRecordSearch(servicePort, 'gerichte', withPickPolicy('gerichte', {
      searchFields: ["gericht_name", "zutaten"] as never,
      where: options.where?.gerichte,
      toItem: options.items?.gerichte as never,
      claim: 'einkaufsplanung.gerichte',
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:einkauf-planen:read:${entity}`);
  // a fixed value the flow sets itself, as a review row with the link that changes it
  const setting = (entity: EntityKey, field: string, value: unknown): SummaryItem => ({
    key: `setting:${entity}.${field}`, label: labelOf(entity, field),
    value: optionsOf(entity, field).find(o => o.key === String(value))?.label ?? String(value ?? ''),
    href: `#/verwaltung/anwendung?line=intent:einkauf-planen:write:${entity}.${field}`,
  });
  const picks = {
    gerichte: { ...searches.gerichte, select: { ...searches.gerichte.select, create: false as boolean, hint: hintFor('gerichte', 'gerichte', null as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'einkaufsplanung', entity: 'einkaufsplanung', form: einkaufsplanung, label: nounOne('einkaufsplanung', entityLabel('einkaufsplanung')), primary: true,
      values: (): FormValues => ({
        erledigt: policyFixedValue('einkaufsplanung', 'erledigt') ?? false,
        ...(variantRef.current ? ACTION_SETS[variantRef.current] ?? {} : {}),
      }),

      // the review shows what this step sets itself — changeable on „Deine Anwendung“, not here
      settings: () => [setting('einkaufsplanung', 'erledigt', policyFixedValue('einkaufsplanung', 'erledigt') ?? false)],
    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'einkauf-planen', onSuccess: (r) => {
    // EF-51: a created or changed parent record keeps its pair of doors in step (made, closed, reopened)
    for (const [k, rec] of Object.entries(r.records)) {
      const ent = plan.find(s => s.key === k)?.entity;
      if (ent && Object.values(DOOR_PARENTS).some(d => d.entity === ent)) void syncDoorsAfterWrite(ent, rec.id, rec.fields);
    }
  } });

  // A typed field the plan prefills from the picked record (`user:from_pick`),
  // still the person's to change: filled once, only while empty (PV-12)
  const prefillFrom = (pickKey: string, rec: JourneyRecord) => {
    void pickKey; void rec;
  };

  // Opened with `?<field>=<value>` for a field this flow asks — a dashboard
  // link that pre-picks the event, a form that hands the question on (J-2):
  // a typed field takes the value while it is empty (a draft wins), a pick
  // loads the record, takes it into the pick and selects it WITH its name.
  // `initial` with a bare record id gets its name the same way.
  const [linkedParams] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
  useEffect(() => {
    let on = true;
    const coerce = (form: StepForm, key: string, raw: string): unknown => {
      const kind = form.rules[key]?.kind;
      if (kind === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : raw; }
      if (kind === 'bool') return raw === 'true' || raw === '1' || raw === 'ja';
      return raw;
    };
    { const v = linkedParams.get('bezeichnung'); if (v !== null && isEmptyValue(einkaufsplanung.get('bezeichnung'))) (einkaufsplanung.set as (k: string, v: unknown) => void)('bezeichnung', coerce(einkaufsplanung, 'bezeichnung', v)); }
    { const v = linkedParams.get('einkaufsdatum'); if (v !== null && isEmptyValue(einkaufsplanung.get('einkaufsdatum'))) (einkaufsplanung.set as (k: string, v: unknown) => void)('einkaufsdatum', coerce(einkaufsplanung, 'einkaufsdatum', v)); }
    { const v = linkedParams.get('zusaetzliche_artikel'); if (v !== null && isEmptyValue(einkaufsplanung.get('zusaetzliche_artikel'))) (einkaufsplanung.set as (k: string, v: unknown) => void)('zusaetzliche_artikel', coerce(einkaufsplanung, 'zusaetzliche_artikel', v)); }
    {
      const cur = forms.einkaufsplanung.get('gerichte');
      const fromLink = linkedParams.get('gerichte');
      const unnamed = typeof cur === 'string' && cur !== '' && !forms.einkaufsplanung.labels[cur] ? cur : null;
      const id = fromLink && isEmptyValue(cur) ? fromLink : unnamed;
      if (id) void servicePort.get('gerichte', id).then(rec => {
        if (!on || !rec) return;
        picks.gerichte.adopt(rec);
        const name = picks.gerichte.labelOf(rec.id) ?? rec.id;
        forms.einkaufsplanung.remember(rec.id, name);
        (forms.einkaufsplanung.set as (k: string, v: unknown, l?: string) => void)('gerichte', [rec.id], name);
      }).catch(() => undefined);
    }
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, []);

  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: EinkaufPlanenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined; recordOf?(id: string): JourneyRecord | undefined }>)[field];
    return {
      selectedId: (typeof owner.get(field) === 'string' ? (owner.get(field) as string) : null) || null,
      // `field as never` collapsed the conditional SetArgs<E, never> to never and
      // no argument was assignable any more (tsc, live 23.09.2026); widen `set`
      // itself instead — the label stays a required third argument.
      onSelect: (id: string) => {
        (owner.set as (k: string, v: unknown, l?: string) => void)(field, id, search?.labelOf(id));
        const rec = search?.recordOf?.(id);
        if (rec) prefillFrom(field, rec);
      },
    };
  };
  /** Props for a multi-record pick step: {...flow.picks.x.select} {...flow.pickMany('x')} */
  const pickMany = (field: EinkaufPlanenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)));
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); };

  /** The ways this flow may end — spread as `variants={flow.actions}` onto <SummaryStep> (PV-14). */
  const flowActions = [
    { id: 'speichern', label: labelIn({"de": "Speichern", "en": "Save"}), confirm: () => { variantRef.current = 'speichern'; return submit.run(); } },
    { id: 'speichern-und-erledigt', label: labelIn({"de": "Speichern und als erledigt markieren", "en": "Save and mark as done"}), confirm: () => { variantRef.current = 'speichern-und-erledigt'; return submit.run(); } },
  ];
  return {
    slug: 'einkauf-planen' as const,
    draftKey: 'einkauf-planen' as const,    actions: flowActions,    entity: 'einkaufsplanung' as const,
    form: einkaufsplanung,
    forms, formList, picks, submit, steps,    reviewStep: EINKAUFPLANEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type EinkaufPlanenFlow = ReturnType<typeof useEinkaufPlanenFlow>;
