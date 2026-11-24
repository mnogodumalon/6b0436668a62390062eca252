/**
 * useGekochtFesthaltenFlow — the plumbing of the flow « Gekocht festhalten », generated from the plan.
 *
 * Writes `kochtagebuch`: asks `gericht`, `geklappt`, `bewertung`, `anmerkungen`, `tatsaechliche_dauer`; sets `gekocht_am` itself.
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
 *   const flow = useGekochtFesthaltenFlow({
 *     steps: { gericht: 1, geklappt: 2, bewertung: 2, anmerkungen: 2, tatsaechliche_dauer: 2 },
 *     items: { gericht: r => ({ id: r.id, title: fieldText(r, 'gericht_name') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <EntitySelectStep {...flow.picks.gericht.select} {...flow.pick('gericht')} />
 *     <Bound form={flow.forms.kochtagebuch} name="geklappt" />
 *     <Bound form={flow.forms.kochtagebuch} name="bewertung" />
 *     <Bound form={flow.forms.kochtagebuch} name="anmerkungen" />
 *     <Bound form={flow.forms.kochtagebuch} name="tatsaechliche_dauer" />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
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
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';

export type GekochtFesthaltenFieldKey = 'anmerkungen' | 'bewertung' | 'geklappt' | 'gericht' | 'tatsaechliche_dauer';

export interface GekochtFesthaltenForms {
  kochtagebuch: StepForm<'kochtagebuch'>;
}

// Alias so the option generics stay readable.
type Key = GekochtFesthaltenFieldKey;

export interface GekochtFesthaltenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    gericht?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
  /** A page-side narrowing per pick, on top of the plan's filter (J-3): the
   *  questions of the picked event, the open ones — `r => fieldRef(r, 'veranstaltung') === eventId`. */
  where?: {
    gericht?: (record: JourneyRecord) => boolean;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"anmerkungen": 2, "bewertung": 2, "geklappt": 2, "gericht": 1, "tatsaechliche_dauer": 2};
export const GEKOCHTFESTHALTEN_REVIEW_STEP = 3;

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

export function useGekochtFesthaltenFlow(options: GekochtFesthaltenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const kochtagebuch = useStepForm('kochtagebuch', {
    fields: ["gericht", "geklappt", "bewertung", "anmerkungen", "tatsaechliche_dauer"],
    steps: only(steps, ["gericht", "geklappt", "bewertung", "anmerkungen", "tatsaechliche_dauer"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["gericht", "geklappt", "bewertung", "anmerkungen", "tatsaechliche_dauer"]),
    messages: only(options.messages as Record<string, string> | undefined, ["gericht", "geklappt", "bewertung", "anmerkungen", "tatsaechliche_dauer"]),
  });
  const forms: GekochtFesthaltenForms = { kochtagebuch };
  // the editor of a list is not a record of its own: the review and the success
  // page read the entries (PlanStep.review), never the half-filled editor
  const formList: StepForm[] = [kochtagebuch];
  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    gericht: useRecordSearch(servicePort, 'gerichte', withPickPolicy('gericht', {
      searchFields: ["gericht_name"] as never,
      where: options.where?.gericht,
      toItem: options.items?.gericht as never,
      claim: 'kochtagebuch.gericht',
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:gekocht-festhalten:read:${entity}`);
  const picks = {
    gericht: { ...searches.gericht, select: { ...searches.gericht.select, create: true as boolean, hint: hintFor('gericht', 'gerichte', null as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'kochtagebuch', entity: 'kochtagebuch', form: kochtagebuch, label: nounOne('kochtagebuch', entityLabel('kochtagebuch')), primary: true,
      values: (): FormValues => ({
        gekocht_am: policyFixedValue('kochtagebuch', 'gekocht_am') ?? todayIso(),
      }),
    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'gekocht-festhalten', onSuccess: (r) => {
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
    { const v = linkedParams.get('geklappt'); if (v !== null && isEmptyValue(kochtagebuch.get('geklappt'))) (kochtagebuch.set as (k: string, v: unknown) => void)('geklappt', coerce(kochtagebuch, 'geklappt', v)); }
    { const v = linkedParams.get('bewertung'); if (v !== null && isEmptyValue(kochtagebuch.get('bewertung'))) (kochtagebuch.set as (k: string, v: unknown) => void)('bewertung', coerce(kochtagebuch, 'bewertung', v)); }
    { const v = linkedParams.get('anmerkungen'); if (v !== null && isEmptyValue(kochtagebuch.get('anmerkungen'))) (kochtagebuch.set as (k: string, v: unknown) => void)('anmerkungen', coerce(kochtagebuch, 'anmerkungen', v)); }
    { const v = linkedParams.get('tatsaechliche_dauer'); if (v !== null && isEmptyValue(kochtagebuch.get('tatsaechliche_dauer'))) (kochtagebuch.set as (k: string, v: unknown) => void)('tatsaechliche_dauer', coerce(kochtagebuch, 'tatsaechliche_dauer', v)); }
    {
      const cur = forms.kochtagebuch.get('gericht');
      const fromLink = linkedParams.get('gericht');
      const unnamed = typeof cur === 'string' && cur !== '' && !forms.kochtagebuch.labels[cur] ? cur : null;
      const id = fromLink && isEmptyValue(cur) ? fromLink : unnamed;
      if (id) void servicePort.get('gerichte', id).then(rec => {
        if (!on || !rec) return;
        picks.gericht.adopt(rec);
        const name = picks.gericht.labelOf(rec.id) ?? rec.id;
        (forms.kochtagebuch.set as (k: string, v: unknown, l?: string) => void)('gericht', rec.id, name);
        prefillFrom('gericht', rec);
      }).catch(() => undefined);
    }
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, []);

  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: GekochtFesthaltenFieldKey) => {
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
  const pickMany = (field: GekochtFesthaltenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)));
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); };

  return {
    slug: 'gekocht-festhalten' as const,
    draftKey: 'gekocht-festhalten' as const,    entity: 'kochtagebuch' as const,
    form: kochtagebuch,
    forms, formList, picks, submit, steps,    reviewStep: GEKOCHTFESTHALTEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type GekochtFesthaltenFlow = ReturnType<typeof useGekochtFesthaltenFlow>;
