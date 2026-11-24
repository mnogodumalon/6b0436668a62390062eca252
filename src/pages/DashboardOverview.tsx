import { useMemo, useState } from 'react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import type { EnrichedEinkaufsplanung } from '@/types/enriched';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { countOf } from '@/config/plan';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { IconPlus, IconClock, IconShoppingCart, IconChefHat, IconToolsKitchen2 } from '@tabler/icons-react';

// Analyse: Hand-Kochplaner fürs Handy. Primär: nach Zubereitungszeit sortierte Gerichte-Liste mit Zeit-Filter
// (kein Widget passt: CalendarWidget/Kanban/Chart decken keine sortierte Vorschlagsliste ab). Hero nur im Leerzustand;
// variant="wide" + StatStrip, darunter zwei WorkLists (offene Einkäufe, zuletzt gekocht); Mobile: eine Spalte.
const TIME_OPTIONS = [15, 30, 45, 60];

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { gerichte, kochtagebuch, einkaufsplanung, setEinkaufsplanung, fetchAll } = data;
  const clock = useClock();

  const markDone = (rec: EnrichedEinkaufsplanung, value: boolean) => {
    const before = rec.fields.erledigt ?? false;
    const patch = (v: boolean) =>
      setEinkaufsplanung(list => list.map(e => (e.record_id === rec.record_id ? { ...e, fields: { ...e.fields, erledigt: v } } : e)));
    patch(value);
    LivingAppsService.updateEinkaufsplanungEntry(rec.record_id, { erledigt: value }).catch(() => fetchAll());
    undoToast(
      value ? tx`${rec.fields.bezeichnung ?? ''} — erledigt` : tx`${rec.fields.bezeichnung ?? ''} — wieder offen`,
      () => {
        patch(before);
        LivingAppsService.updateEinkaufsplanungEntry(rec.record_id, { erledigt: before }).catch(() => fetchAll());
      },
    );
  };

  const crud = useEntityCrud(data, {
    footer: top =>
      top.type === 'einkaufsplanung' && !top.record.fields.erledigt
        ? { label: tx('Einkauf erledigt'), onClick: () => markDone(top.record, true) }
        : undefined,
  });
  const enrichedKochtagebuch = crud.enriched.kochtagebuch;
  const enrichedEinkaufsplanung = crud.enriched.einkaufsplanung;

  const [maxMin, setMaxMin] = useState<number | null>(null);

  const sortedGerichte = useMemo(
    () => [...gerichte].sort((a, b) => (a.fields.zubereitungszeit ?? 9999) - (b.fields.zubereitungszeit ?? 9999)),
    [gerichte],
  );
  const shown = maxMin == null ? sortedGerichte : sortedGerichte.filter(g => (g.fields.zubereitungszeit ?? 9999) <= maxMin);
  const quick = sortedGerichte.filter(g => (g.fields.zubereitungszeit ?? 9999) <= 30);

  const offen = enrichedEinkaufsplanung
    .filter(e => !e.fields.erledigt)
    .sort((a, b) => (a.fields.einkaufsdatum ?? '9999').localeCompare(b.fields.einkaufsdatum ?? '9999'));
  const zuletzt = [...enrichedKochtagebuch].sort((a, b) => (b.fields.gekocht_am ?? '').localeCompare(a.fields.gekocht_am ?? ''));

  const last = zuletzt[0];
  const context = last
    ? offen.length > 0
      ? tx`Zuletzt gab es ${last.gerichtName} — ein Einkauf wartet noch.`
      : tx`Zuletzt gab es ${last.gerichtName} — der Einkauf ist erledigt.`
    : quick.length > 0
      ? tx`Schnell geht heute: ${namen(quick.slice(0, 2).map(g => g.fields.gericht_name ?? ''))}.`
      : tx`Lege deine ersten Gerichte an und finde abends schneller etwas.`;

  const ratingTone = (key: string | undefined) =>
    key === 'bewertung_4' || key === 'bewertung_5' ? 'text-emerald-600' : key === 'bewertung_1' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.gerichte.canWrite && (
          <Button className="h-12 w-full sm:w-auto" onClick={() => crud.gerichte.openCreate({})}>
            <IconPlus size={18} className="shrink-0" /> {tx('Neues Gericht')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          gerichte.length === 0 && (
            <HeroBanner
              icon={<IconChefHat size={48} />}
              action={{ label: tx('Erstes Gericht anlegen'), onClick: () => crud.gerichte.openCreate({}) }}
            >
              {tx('Noch keine Gerichte — leg dein erstes Gericht mit Zutaten und Zubereitungszeit an.')}
            </HeroBanner>
          )
        }
        kpis={
          gerichte.length > 0 && (
            <StatStrip>
              <StatStripItem
                title={tx('Schnell (bis 30 Min.)')}
                value={quick.length}
                icon={<IconClock size={16} />}
                tone={maxMin === 30 ? 'primary' : 'default'}
                active={maxMin === 30}
                onClick={() => setMaxMin(m => (m === 30 ? null : 30))}
              />
              <StatStripItem
                title={tx('Offene Einkäufe')}
                value={offen.length}
                icon={<IconShoppingCart size={16} />}
                tone={offen.length > 0 ? 'warning' : 'default'}
              />
            </StatStrip>
          )
        }
        primary={
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="space-y-3 p-4">
              <h2 className="text-lg font-semibold">{tx('Was koche ich heute?')}</h2>
              <p className="text-sm text-muted-foreground">{tx('Wie viel Zeit hast du? Die kürzesten Gerichte stehen oben.')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant={maxMin == null ? 'default' : 'outline'} className="h-11 px-4" onClick={() => setMaxMin(null)}>
                  {tx('Alle')}
                </Button>
                {TIME_OPTIONS.map(m => (
                  <Button key={m} variant={maxMin === m ? 'default' : 'outline'} className="h-11 px-4" onClick={() => setMaxMin(maxMin === m ? null : m)}>
                    {tx`bis ${m} Min.`}
                  </Button>
                ))}
              </div>
            </div>
            <ul className="divide-y border-t">
              {shown.map(g => (
                <li key={g.record_id}>
                  <button
                    type="button"
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    onClick={() => crud.gerichte.openDetail(g)}
                  >
                    <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="text-base font-semibold leading-none">{g.fields.zubereitungszeit ?? '–'}</span>
                      <span className="text-[10px]">{tx('Min.')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{g.fields.gericht_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {g.fields.kategorie?.label ?? tx('Ohne Kategorie')}
                        {g.fields.portionen ? ` · ${g.fields.portionen} ${tx('Portionen')}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="space-y-3 p-4 text-sm text-muted-foreground">
                  <p>
                    {sortedGerichte.length > 0
                      ? tx`Kein Gericht in dieser Zeit — das kürzeste braucht ${sortedGerichte[0].fields.zubereitungszeit ?? 0} Min.`
                      : tx('Noch keine Gerichte vorhanden.')}
                  </p>
                  {crud.gerichte.canWrite && (
                    <Button variant="outline" className="h-11" onClick={() => crud.gerichte.openCreate({})}>
                      <IconToolsKitchen2 size={16} className="shrink-0" /> {tx('Gericht anlegen')}
                    </Button>
                  )}
                </li>
              )}
            </ul>
          </section>
        }
        aside={
          <>
            <WorkList
              title={tx('Offene Einkaufsplanungen')}
              items={offen.map(e => ({
                id: e.record_id,
                title: e.fields.bezeichnung ?? appLabel('einkaufsplanung'),
                secondLine: (
                  <>
                    <span className="font-medium text-amber-600">{e.fields.einkaufsdatum ? formatDate(e.fields.einkaufsdatum) : tx('Ohne Datum')}</span>
                    <span className="text-muted-foreground"> · {e.gerichteName || tx('Nur zusätzliche Artikel')}</span>
                  </>
                ),
                action: { label: tx('✓ Erledigt'), onClick: () => markDone(e, true) },
              }))}
              onItemClick={id => {
                const rec = einkaufsplanung.find(e => e.record_id === id);
                if (rec) crud.einkaufsplanung.openDetail(rec);
              }}
              empty={{
                text: tx('Kein Einkauf offen.'),
                action: crud.einkaufsplanung.canWrite ? { label: tx('Einkauf planen'), onClick: () => crud.einkaufsplanung.openCreate({}) } : undefined,
              }}
            />
            <WorkList
              title={tx('Zuletzt gekocht')}
              items={zuletzt.slice(0, 5).map(k => ({
                id: k.record_id,
                title: k.gerichtName,
                secondLine: (
                  <>
                    <span className={`font-medium ${ratingTone(lookupKey(k.fields.bewertung) ?? undefined)}`}>
                      {k.fields.bewertung?.label ?? tx('Ohne Bewertung')}
                    </span>
                    <span className="text-muted-foreground">
                      {k.fields.gekocht_am ? ` · ${formatDate(k.fields.gekocht_am)}` : ''}
                      {k.fields.tatsaechliche_dauer ? ` · ${k.fields.tatsaechliche_dauer} ${tx('Min.')}` : ''}
                    </span>
                  </>
                ),
              }))}
              onItemClick={id => {
                const rec = kochtagebuch.find(k => k.record_id === id);
                if (rec) crud.kochtagebuch.openDetail(rec);
              }}
              empty={{ text: tx('Noch nichts im Kochtagebuch.') }}
            />
          </>
        }
      />
      {crud.surfaces}
    </div>
  );
}
