import type { EnrichedEinkaufsplanung, EnrichedKochtagebuch } from '@/types/enriched';
import type { Einkaufsplanung, Gerichte, Kochtagebuch } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import { displayPart } from '@/lib/journey/rules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => displayPart(r.fields[f])).filter(Boolean).join(' ').trim();
}

interface KochtagebuchMaps {
  gerichteMap: Map<string, Gerichte>;
}

export function enrichKochtagebuch(
  kochtagebuch: Kochtagebuch[],
  maps: KochtagebuchMaps
): EnrichedKochtagebuch[] {
  return kochtagebuch.map(r => ({
    ...r,
    gerichtName: resolveDisplay(r.fields.gericht, maps.gerichteMap, 'gericht_name'),
  }));
}

interface EinkaufsplanungMaps {
  gerichteMap: Map<string, Gerichte>;
}

export function enrichEinkaufsplanung(
  einkaufsplanung: Einkaufsplanung[],
  maps: EinkaufsplanungMaps
): EnrichedEinkaufsplanung[] {
  return einkaufsplanung.map(r => ({
    ...r,
    gerichteName: resolveDisplay(r.fields.gerichte, maps.gerichteMap, 'gericht_name'),
  }));
}
