import type { Kochtagebuch, Gerichte } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';
import { displayNameOf } from '@/lib/journey/rules';

export interface KochtagebuchDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Kochtagebuch;
  /** N:1-Ziel „Gerichte": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  gerichteList: Gerichte[];
  /** Klick auf die Gerichte-Relation → overlay.push auf dessen Detail. */
  onOpenGerichte?: (record: Gerichte) => void;
}

export function KochtagebuchDetails({
  record,
  gerichteList,
  onOpenGerichte,
}: KochtagebuchDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const gerichtTarget = gerichteList.find(r => r.record_id === extractRecordId(record.fields.gericht));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('kochtagebuch', 'gekocht_am')} value={record.fields.gekocht_am} format="date" />
        <RecordField label={fieldLabel('kochtagebuch', 'geklappt')} value={record.fields.geklappt} format="bool" />
        <RecordField label={fieldLabel('kochtagebuch', 'bewertung')} value={record.fields.bewertung} format="pill" />
        <RecordField label={fieldLabel('kochtagebuch', 'tatsaechliche_dauer')} value={record.fields.tatsaechliche_dauer} format="text" />
        <RecordField label={fieldLabel('kochtagebuch', 'anmerkungen')} value={record.fields.anmerkungen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('kochtagebuch', 'gericht')}
          name={gerichtTarget ? (displayNameOf('gerichte', gerichtTarget.fields as Record<string, unknown>) || '—') : '—'}
          meta={undefined}
          onClick={gerichtTarget && onOpenGerichte ? () => onOpenGerichte!(gerichtTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.KOCHTAGEBUCH} recordId={record.record_id} readOnly={!perms.canWrite('kochtagebuch')} />
    </>
  );
}
