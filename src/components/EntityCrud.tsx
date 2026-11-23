/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'gerichte'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.gerichte.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.gerichte.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.gerichte.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.gerichte              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled; list-field back-references additionally get a
 * "choose existing" picker that links an EXISTING record — built in, do not
 * re-roll). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   gerichte: gericht_name, kategorie, zubereitungszeit, portionen, zutaten, zubereitung  ·  ← kochtagebuch (list + contextual +) · ← einkaufsplanung (list + contextual + + choose existing)
 *   kochtagebuch: gericht, gekocht_am, geklappt, bewertung, tatsaechliche_dauer, anmerkungen  ·  → gerichte
 *   einkaufsplanung: bezeichnung, einkaufsdatum, gerichte, zusaetzliche_artikel, erledigt  ·  → gerichte
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { Gerichte, Kochtagebuch, Einkaufsplanung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordIds } from '@/services/livingAppsService';
import { enrichKochtagebuch, enrichEinkaufsplanung } from '@/lib/enrich';
import type { EnrichedKochtagebuch, EnrichedEinkaufsplanung } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { GerichteDialog, type GerichteDialogDefaults } from '@/components/dialogs/GerichteDialog';
import { GerichteDetails } from '@/components/details/GerichteDetails';
import { KochtagebuchDialog, type KochtagebuchDialogDefaults } from '@/components/dialogs/KochtagebuchDialog';
import { KochtagebuchDetails } from '@/components/details/KochtagebuchDetails';
import { EinkaufsplanungDialog, type EinkaufsplanungDialogDefaults } from '@/components/dialogs/EinkaufsplanungDialog';
import { EinkaufsplanungDetails } from '@/components/details/EinkaufsplanungDetails';
import { PickExistingDialog } from '@/components/PickExistingDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { usePermissions } from '@/lib/permissions';
import { toast } from 'sonner';
import { syncDoorsAfterWrite } from '@/lib/publicDoors';
import { displayNameOf, displayPart } from '@/lib/journey/rules';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'gerichte'; record: Gerichte }
  | { type: 'kochtagebuch'; record: EnrichedKochtagebuch }
  | { type: 'einkaufsplanung'; record: EnrichedEinkaufsplanung };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  /** The action may return a sentence — the reason the step was NOT taken; the overlay shows it under the button. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void | string | Promise<void | string> } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
  /** May the signed-in user create/change records of this list? (the
   *  platform's rights — show a „+ Neu“ only when true; openCreate/openEdit
   *  refuse with a notice otherwise). */
  canWrite: boolean;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  gerichte: EntityCrudApi<Gerichte, GerichteDialogDefaults>;
  kochtagebuch: EntityCrudApi<Kochtagebuch, KochtagebuchDialogDefaults>;
  einkaufsplanung: EntityCrudApi<Einkaufsplanung, EinkaufsplanungDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { gerichte: Gerichte[]; kochtagebuch: EnrichedKochtagebuch[]; einkaufsplanung: EnrichedEinkaufsplanung[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  // the platform's rights of the signed-in user (lib/permissions.ts) — unknown = allowed
  const perms = usePermissions();
  const refuse = () => { toast.error(t('perm_denied_title'), { description: t('perm_denied_desc') }); };
  const [gerichteDialog, setGerichteDialog] = useState<{ defaults?: GerichteDialogDefaults; editing?: Gerichte } | null>(null);
  const [kochtagebuchDialog, setKochtagebuchDialog] = useState<{ defaults?: KochtagebuchDialogDefaults; editing?: Kochtagebuch } | null>(null);
  const [einkaufsplanungDialog, setEinkaufsplanungDialog] = useState<{ defaults?: EinkaufsplanungDialogDefaults; editing?: Einkaufsplanung } | null>(null);
  // „Vorhandene wählen" für den Listenfeld-Rückbezug einkaufsplanung.gerichte → gerichte: hält die Hub-record_id.
  const [pickGerichteEinkaufsplanung, setPickGerichteEinkaufsplanung] = useState<string | null>(null);
  const enrichedKochtagebuch = useMemo(() => enrichKochtagebuch(data.kochtagebuch, { gerichteMap: data.gerichteMap }), [data.kochtagebuch, data.gerichteMap]);
  const enrichedEinkaufsplanung = useMemo(() => enrichEinkaufsplanung(data.einkaufsplanung, { gerichteMap: data.gerichteMap }), [data.einkaufsplanung, data.gerichteMap]);

  function detailGerichte(record: Gerichte, push = false) {
    const item: OverlayItem = { type: 'gerichte', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitGerichte(fields: Gerichte['fields']) {
    const editing = gerichteDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setGerichte(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateGerichteEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('gerichte')} — ${t('crud_updated')}`, async () => {
        data.setGerichte(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateGerichteEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
      void syncDoorsAfterWrite('gerichte', editing.record_id, fields as Record<string, unknown>);
    } else {
      const made = await LivingAppsService.createGerichteEntry(fields);
      undoToast(`${appLabel('gerichte')} — ${t('crud_created')}`);
      // EF-51: a new parent record gets its pair of doors right away (the record's own link)
      const madeId = (made as { id?: string; record_id?: string } | undefined)?.id ?? (made as { record_id?: string } | undefined)?.record_id;
      if (madeId) void syncDoorsAfterWrite('gerichte', madeId, fields as Record<string, unknown>).then(r => { if (!r.ok) toast.error(r.message ? `${t('door_failed')}: ${r.message}` : t('door_failed_later')); });
      data.fetchAll();
    }
  }

  // Link an EXISTING Einkaufsplanung to the Gerichte hub: append the hub URL to the
  // source's list field. Optimistic setter first, PATCH, undoToast counter-write.
  async function linkGerichteEinkaufsplanung(sourceId: string) {
    const hub = pickGerichteEinkaufsplanung;
    const src = data.einkaufsplanung.find(r => r.record_id === sourceId);
    if (!hub || !src) return;
    const ids = extractRecordIds(src.fields.gerichte);
    if (ids.includes(hub)) return;
    const next = [...ids, hub].map(id => createRecordUrl(APP_IDS.GERICHTE, id));
    data.setEinkaufsplanung(list => list.map(r => (r.record_id === sourceId ? { ...r, fields: { ...r.fields, gerichte: next } } : r)));
    try {
      await LivingAppsService.updateEinkaufsplanungEntry(sourceId, { gerichte: next });
    } catch (err) {
      data.fetchAll();
      throw err;
    }
    undoToast(`${appLabel('einkaufsplanung')} — ${t('pick_linked')}`, async () => {
      data.setEinkaufsplanung(list => list.map(r => (r.record_id === sourceId ? src : r)));
      try { await LivingAppsService.updateEinkaufsplanungEntry(sourceId, { gerichte: src.fields.gerichte }); } catch { data.fetchAll(); }
    });
  }

  function detailKochtagebuch(record: Kochtagebuch, push = false) {
    const rec = enrichedKochtagebuch.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'kochtagebuch', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitKochtagebuch(fields: Kochtagebuch['fields']) {
    const editing = kochtagebuchDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setKochtagebuch(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateKochtagebuchEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('kochtagebuch')} — ${t('crud_updated')}`, async () => {
        data.setKochtagebuch(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateKochtagebuchEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
      void syncDoorsAfterWrite('kochtagebuch', editing.record_id, fields as Record<string, unknown>);
    } else {
      const made = await LivingAppsService.createKochtagebuchEntry(fields);
      undoToast(`${appLabel('kochtagebuch')} — ${t('crud_created')}`);
      // EF-51: a new parent record gets its pair of doors right away (the record's own link)
      const madeId = (made as { id?: string; record_id?: string } | undefined)?.id ?? (made as { record_id?: string } | undefined)?.record_id;
      if (madeId) void syncDoorsAfterWrite('kochtagebuch', madeId, fields as Record<string, unknown>).then(r => { if (!r.ok) toast.error(r.message ? `${t('door_failed')}: ${r.message}` : t('door_failed_later')); });
      data.fetchAll();
    }
  }

  function detailEinkaufsplanung(record: Einkaufsplanung, push = false) {
    const rec = enrichedEinkaufsplanung.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'einkaufsplanung', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitEinkaufsplanung(fields: Einkaufsplanung['fields']) {
    const editing = einkaufsplanungDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setEinkaufsplanung(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateEinkaufsplanungEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('einkaufsplanung')} — ${t('crud_updated')}`, async () => {
        data.setEinkaufsplanung(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateEinkaufsplanungEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
      void syncDoorsAfterWrite('einkaufsplanung', editing.record_id, fields as Record<string, unknown>);
    } else {
      const made = await LivingAppsService.createEinkaufsplanungEntry(fields);
      undoToast(`${appLabel('einkaufsplanung')} — ${t('crud_created')}`);
      // EF-51: a new parent record gets its pair of doors right away (the record's own link)
      const madeId = (made as { id?: string; record_id?: string } | undefined)?.id ?? (made as { record_id?: string } | undefined)?.record_id;
      if (madeId) void syncDoorsAfterWrite('einkaufsplanung', madeId, fields as Record<string, unknown>).then(r => { if (!r.ok) toast.error(r.message ? `${t('door_failed')}: ${r.message}` : t('door_failed_later')); });
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <GerichteDialog
        open={gerichteDialog !== null}
        onClose={() => setGerichteDialog(null)}
        onSubmit={submitGerichte}
        defaultValues={gerichteDialog?.defaults}
        recordId={gerichteDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Gerichte']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Gerichte']}
      />
      <KochtagebuchDialog
        open={kochtagebuchDialog !== null}
        onClose={() => setKochtagebuchDialog(null)}
        onSubmit={submitKochtagebuch}
        defaultValues={kochtagebuchDialog?.defaults}
        recordId={kochtagebuchDialog?.editing?.record_id}
        gerichteList={data.gerichte}
        enablePhotoScan={AI_PHOTO_SCAN['Kochtagebuch']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kochtagebuch']}
      />
      <EinkaufsplanungDialog
        open={einkaufsplanungDialog !== null}
        onClose={() => setEinkaufsplanungDialog(null)}
        onSubmit={submitEinkaufsplanung}
        defaultValues={einkaufsplanungDialog?.defaults}
        recordId={einkaufsplanungDialog?.editing?.record_id}
        gerichteList={data.gerichte}
        enablePhotoScan={AI_PHOTO_SCAN['Einkaufsplanung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Einkaufsplanung']}
      />
      <PickExistingDialog
        open={pickGerichteEinkaufsplanung !== null}
        onClose={() => setPickGerichteEinkaufsplanung(null)}
        title={t('pick_title', { title: appLabel('einkaufsplanung') })}
        items={data.einkaufsplanung
          .filter(r => !extractRecordIds(r.fields.gerichte).includes(pickGerichteEinkaufsplanung ?? ''))
          .map(r => ({ id: r.record_id, label: String(displayNameOf('einkaufsplanung', r.fields as Record<string, unknown>) || appLabel('einkaufsplanung')), hint: displayPart(r.fields.einkaufsdatum) ? String(displayPart(r.fields.einkaufsdatum)) : undefined }))}
        onPick={linkGerichteEinkaufsplanung}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'gerichte') {
            return (
              <>
                <RecordHeader title={displayNameOf('gerichte', top.record.fields as Record<string, unknown>) || appLabel('gerichte')} subtitle={undefined} />
                <GerichteDetails
                  record={top.record}
                  kochtagebuchList={data.kochtagebuch}
                  onOpenKochtagebuch={(r) => detailKochtagebuch(r, true)}
                  onAddKochtagebuch={perms.canWrite('kochtagebuch') ? () => setKochtagebuchDialog({ defaults: { gericht: createRecordUrl(APP_IDS.GERICHTE, top.record.record_id) } }) : undefined}
                  einkaufsplanungList={data.einkaufsplanung}
                  onOpenEinkaufsplanung={(r) => detailEinkaufsplanung(r, true)}
                  onAddEinkaufsplanung={perms.canWrite('einkaufsplanung') ? () => setEinkaufsplanungDialog({ defaults: { gerichte: [createRecordUrl(APP_IDS.GERICHTE, top.record.record_id)] } }) : undefined}
                  onPickEinkaufsplanung={perms.canWrite('einkaufsplanung') ? () => setPickGerichteEinkaufsplanung(top.record.record_id) : undefined}
                />
              </>
            );
          }
          if (top.type === 'kochtagebuch') {
            return (
              <>
                <RecordHeader title={displayNameOf('kochtagebuch', top.record.fields as Record<string, unknown>) || appLabel('kochtagebuch')} subtitle={top.record.fields.gekocht_am ? formatDate(top.record.fields.gekocht_am) : undefined} />
                <KochtagebuchDetails
                  record={top.record}
                  gerichteList={data.gerichte}
                  onOpenGerichte={(r) => detailGerichte(r, true)}
                />
              </>
            );
          }
          if (top.type === 'einkaufsplanung') {
            return (
              <>
                <RecordHeader title={displayNameOf('einkaufsplanung', top.record.fields as Record<string, unknown>) || appLabel('einkaufsplanung')} subtitle={top.record.fields.einkaufsdatum ? formatDate(top.record.fields.einkaufsdatum) : undefined} />
                <EinkaufsplanungDetails
                  record={top.record}
                  gerichteList={data.gerichte}
                />
              </>
            );
          }
          return null;
        }}
        canEdit={(top) => {
          if (top.type === 'gerichte') return perms.canWrite('gerichte');
          if (top.type === 'kochtagebuch') return perms.canWrite('kochtagebuch');
          if (top.type === 'einkaufsplanung') return perms.canWrite('einkaufsplanung');
          return true;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'gerichte') setGerichteDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'kochtagebuch') setKochtagebuchDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'einkaufsplanung') setEinkaufsplanungDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    gerichte: {
      openCreate: (defaults?: GerichteDialogDefaults) => (perms.canWrite('gerichte') ? setGerichteDialog({ defaults }) : refuse()),
      openEdit: (record: Gerichte) => (perms.canWrite('gerichte') ? setGerichteDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Gerichte) => detailGerichte(record, false),
      canWrite: perms.canWrite('gerichte'),
    },
    kochtagebuch: {
      openCreate: (defaults?: KochtagebuchDialogDefaults) => (perms.canWrite('kochtagebuch') ? setKochtagebuchDialog({ defaults }) : refuse()),
      openEdit: (record: Kochtagebuch) => (perms.canWrite('kochtagebuch') ? setKochtagebuchDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Kochtagebuch) => detailKochtagebuch(record, false),
      canWrite: perms.canWrite('kochtagebuch'),
    },
    einkaufsplanung: {
      openCreate: (defaults?: EinkaufsplanungDialogDefaults) => (perms.canWrite('einkaufsplanung') ? setEinkaufsplanungDialog({ defaults }) : refuse()),
      openEdit: (record: Einkaufsplanung) => (perms.canWrite('einkaufsplanung') ? setEinkaufsplanungDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Einkaufsplanung) => detailEinkaufsplanung(record, false),
      canWrite: perms.canWrite('einkaufsplanung'),
    },
    enriched: { gerichte: data.gerichte, kochtagebuch: enrichedKochtagebuch, einkaufsplanung: enrichedEinkaufsplanung },
  };
}
