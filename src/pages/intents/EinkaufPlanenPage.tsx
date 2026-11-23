/**
 * Einkauf planen — 4-Schritt-Wizard.
 * Steps: 1) Bezeichnung & Einkaufsdatum → 2) Gerichte wählen → 3) Zusätzliche Artikel → 4) Prüfen & speichern.
 * Reads: gerichte. Writes: einkaufsplanung (über useEinkaufPlanenFlow).
 * Composes: IntentWizardShell, Bound, Field, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useRef, useState } from 'react';
import { IconShoppingCart } from '@tabler/icons-react';
import { DatePicker } from '@/components/DatePicker';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldNumber, fieldLookup } from '@/lib/journey';
import { useEinkaufPlanenFlow } from '@/lib/journey/flows/EinkaufPlanen';
import { tx } from '@/i18n';

interface ShoppingGroup {
  id: string;
  name: string;
  lines: string[];
}

function ShoppingList({ groups }: { groups: ShoppingGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-3 overflow-hidden rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 font-medium">
        <IconShoppingCart size={18} className="shrink-0 text-muted-foreground" />
        <span>{tx('Zutaten der gewählten Gerichte')}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {groups.map(g => (
          <div key={g.id} className="min-w-0 rounded-xl bg-secondary/50 p-3">
            <div className="mb-1 truncate text-sm font-semibold">{g.name}</div>
            {g.lines.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
                {g.lines.map((l, i) => (
                  <li key={i} className="break-words">{l}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{tx('Keine Zutaten hinterlegt.')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EinkaufPlanenPage() {
  const [step, setStep] = useState(1);
  const flow = useEinkaufPlanenFlow({
    steps: { bezeichnung: 1, einkaufsdatum: 1, gerichte: 2, zusaetzliche_artikel: 3 },
    items: {
      gerichte: r => {
        const minuten = fieldNumber(r, 'zubereitungszeit');
        const portionen = fieldNumber(r, 'portionen');
        const teile = [
          fieldLookup(r, 'kategorie')?.label,
          minuten != null ? tx`${minuten} Min.` : undefined,
          portionen != null ? tx`${portionen} Portionen` : undefined,
        ].filter(Boolean);
        return { id: r.id, title: fieldText(r, 'gericht_name'), subtitle: teile.join(' · ') };
      },
    },
  });

  const form = flow.forms.einkaufsplanung;
  const pickedIds = (form.get('gerichte') as string[] | undefined) ?? [];
  const live: ShoppingGroup[] = pickedIds.flatMap(id => {
    const rec = flow.picks.gerichte.recordOf(id);
    if (!rec) return [];
    const lines = fieldText(rec, 'zutaten').split('\n').map(l => l.trim()).filter(Boolean);
    return [{ id, name: fieldText(rec, 'gericht_name'), lines }];
  });
  // keep the list for the success screen, even if the form is cleared after saving
  const snapshot = useRef<ShoppingGroup[]>([]);
  if (live.length > 0) snapshot.current = live;
  const groups = live.length > 0 ? live : snapshot.current;

  return (
    <IntentWizardShell
      title={tx('Einkauf planen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Wähle Gerichte aus und bekomm die Einkaufsliste mit allen Zutaten.'),
        needs: [tx('Eine Bezeichnung für den Einkauf'), tx('Die Gerichte, die du kochen willst')],
      }}
    >
      <WizardStep label={tx('Einkauf')} description={tx('Gib dem Einkauf einen Namen und, wenn du magst, ein Datum.')}>
        <div className="space-y-4">
          <Bound form={form} name="bezeichnung" placeholder={tx('z. B. Wocheneinkauf')} />
          <Field form={form} name="einkaufsdatum">
            <DatePicker {...form.date('einkaufsdatum')} />
          </Field>
          <StepNav hideBack onNext={() => flow.validateStep(1)} nextStepLabel={tx('Gerichte')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Gerichte')} description={tx('Wähle alle Gerichte, für die du einkaufen willst.')}>
        <div className="space-y-4">
          <Field form={form} name="gerichte">
            <EntitySelectStep
              {...flow.picks.gerichte.select}
              {...flow.pickMany('gerichte')}
              searchPlaceholder={tx('Gericht suchen …')}
              avatar="none"
            />
          </Field>
          <ShoppingList groups={live} />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={tx('Zusätzliche Artikel')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Zusätzliches')} description={tx('Fehlt noch etwas, das in keinem Gericht steckt? Trag es hier ein.')}>
        <div className="space-y-4">
          <Bound
            form={form}
            name="zusaetzliche_artikel"
            rows={5}
            hint={tx('Ein Artikel pro Zeile, z. B. Spülmittel oder Brot')}
          />
          <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <div className="space-y-4">
            <SummaryStep
              forms={flow.formList}
              submit={flow.submit}
              variants={flow.actions}
              whatHappensNext={tx('Die Einkaufsplanung wird gespeichert und die Einkaufsliste angezeigt.')}
            />
            <ShoppingList groups={groups} />
          </div>
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          whatHappensNext={tx('Hier ist deine Einkaufsliste mit den Zutaten der gewählten Gerichte.')}
          next={[
            { label: tx('Gekocht festhalten'), href: '#/intents/gekocht-festhalten' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        >
          <ShoppingList groups={groups} />
        </SuccessStep>
      )}
    </IntentWizardShell>
  );
}
