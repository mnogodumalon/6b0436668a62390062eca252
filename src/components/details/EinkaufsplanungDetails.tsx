import type { Einkaufsplanung, Gerichte } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';

export interface EinkaufsplanungDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Einkaufsplanung;
  /** N:1-Ziel „Gerichte": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  gerichteList: Gerichte[];
  /** Reserviert — Gerichte ist hier nur über ein Mehrfach-Feld verknüpft (Text-Join, keine Einzel-Relation); Übergabe erlaubt, aber ohne Wirkung. */
  onOpenGerichte?: (record: Gerichte) => void;
}

export function EinkaufsplanungDetails({
  record,
  gerichteList,
}: EinkaufsplanungDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('einkaufsplanung', 'bezeichnung')} value={record.fields.bezeichnung} format="text" />
        <RecordField label={fieldLabel('einkaufsplanung', 'einkaufsdatum')} value={record.fields.einkaufsdatum} format="date" />
        <RecordField label={fieldLabel('einkaufsplanung', 'gerichte')} value={Array.isArray(record.fields.gerichte) ? record.fields.gerichte.map((u: unknown) => gerichteList.find(t => t.record_id === extractRecordId(u))?.fields.gericht_name ?? '—').join(', ') : null} format="text" />
        <RecordField label={fieldLabel('einkaufsplanung', 'zusaetzliche_artikel')} value={record.fields.zusaetzliche_artikel} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('einkaufsplanung', 'erledigt')} value={record.fields.erledigt} format="bool" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.EINKAUFSPLANUNG} recordId={record.record_id} readOnly={!perms.canWrite('einkaufsplanung')} />
    </>
  );
}
