import type { Gerichte, Kochtagebuch, Einkaufsplanung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';
import { usePermissions } from '@/lib/permissions';
import { displayNameOf, displayPart } from '@/lib/journey/rules';

export interface GerichteDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Gerichte;
  /** 1:N „Kochtagebuch" (gericht): VOLLE Liste — der Block filtert auf diesen Record. */
  kochtagebuchList: Kochtagebuch[];
  /** Zeilen-Klick → overlay.push auf das Kochtagebuch-Detail (nie der Edit-Dialog). */
  onOpenKochtagebuch: (record: Kochtagebuch) => void;
  /** Kontextuelles „+": öffnet den Kochtagebuch-Dialog mit diesem Record vorgesetzt. */
  onAddKochtagebuch?: () => void;
  /** 1:N „Einkaufsplanung" (gerichte): VOLLE Liste — der Block filtert auf diesen Record. */
  einkaufsplanungList: Einkaufsplanung[];
  /** Zeilen-Klick → overlay.push auf das Einkaufsplanung-Detail (nie der Edit-Dialog). */
  onOpenEinkaufsplanung: (record: Einkaufsplanung) => void;
  /** Kontextuelles „+": öffnet den Einkaufsplanung-Dialog mit diesem Record vorgesetzt. */
  onAddEinkaufsplanung?: () => void;
  /** „Vorhandene wählen": Listenfeld-Rückbezug — hängt diesen Record an einen bestehenden Einkaufsplanung-Datensatz. */
  onPickEinkaufsplanung?: () => void;
}

export function GerichteDetails({
  record,
  kochtagebuchList,
  onOpenKochtagebuch,
  onAddKochtagebuch,
  einkaufsplanungList,
  onOpenEinkaufsplanung,
  onAddEinkaufsplanung,
  onPickEinkaufsplanung,
}: GerichteDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('gerichte', 'gericht_name')} value={record.fields.gericht_name} format="text" />
        <RecordField label={fieldLabel('gerichte', 'kategorie')} value={record.fields.kategorie} format="pill" />
        <RecordField label={fieldLabel('gerichte', 'zubereitungszeit')} value={record.fields.zubereitungszeit} format="text" />
        <RecordField label={fieldLabel('gerichte', 'portionen')} value={record.fields.portionen} format="text" />
        <RecordField label={fieldLabel('gerichte', 'zutaten')} value={record.fields.zutaten} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('gerichte', 'zubereitung')} value={record.fields.zubereitung} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('kochtagebuch')}
        items={kochtagebuchList.filter(r => extractRecordId(r.fields.gericht) === record.record_id)}
        map={r => ({ name: displayNameOf('kochtagebuch', r.fields as Record<string, unknown>) || appLabel('kochtagebuch'), meta: displayPart(r.fields.gekocht_am) })}
        onOpen={onOpenKochtagebuch}
        onAdd={onAddKochtagebuch}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('einkaufsplanung')}
        items={einkaufsplanungList.filter(r => Array.isArray(r.fields.gerichte) && r.fields.gerichte.some((u: unknown) => extractRecordId(u) === record.record_id))}
        map={r => ({ name: displayNameOf('einkaufsplanung', r.fields as Record<string, unknown>) || appLabel('einkaufsplanung'), meta: displayPart(r.fields.einkaufsdatum) })}
        onOpen={onOpenEinkaufsplanung}
        onAdd={onAddEinkaufsplanung}
        onPick={onPickEinkaufsplanung}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.GERICHTE} recordId={record.record_id} readOnly={!perms.canWrite('gerichte')} />
    </>
  );
}
