/**
 * Gekocht festhalten — 4-Schritt-Wizard.
 * Steps: 1) Gericht wählen → 2) Hat es geklappt + Bewertung → 3) Dauer & Anmerkungen → 4) Prüfen & speichern.
 * Reads: gerichte. Writes: kochtagebuch (Kochdatum = heute, vom Plan gesetzt).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldNumber, fieldLookup } from '@/lib/journey';
import { useGekochtFesthaltenFlow } from '@/lib/journey/flows/GekochtFesthalten';
import { tx } from '@/i18n';

export default function GekochtFesthaltenPage() {
  const [step, setStep] = useState(1);
  const flow = useGekochtFesthaltenFlow({
    steps: { gericht: 1, geklappt: 2, bewertung: 2, tatsaechliche_dauer: 3, anmerkungen: 3 },
    items: {
      gericht: r => {
        const minuten = fieldNumber(r, 'zubereitungszeit');
        return {
          id: r.id,
          title: fieldText(r, 'gericht_name'),
          subtitle: [fieldLookup(r, 'kategorie')?.label, minuten != null ? tx`${minuten} Min.` : null]
            .filter(Boolean)
            .join(' · '),
        };
      },
    },
  });

  const gerichtId = flow.forms.kochtagebuch.get('gericht') as string | null | undefined;
  const geplant = gerichtId ? fieldNumber(flow.picks.gericht.recordOf(gerichtId) ?? { id: '', fields: {}, createdAt: null }, 'zubereitungszeit') : null;

  return (
    <IntentWizardShell
      title={tx('Gekocht festhalten')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Halte fest, wie dein Gericht geklappt hat — für das nächste Mal.'),
        needs: [tx('Das gekochte Gericht')],
      }}
    >
      <WizardStep label={tx('Gericht')} description={tx('Welches Gericht hast du gekocht?')}>
        <EntitySelectStep
          {...flow.picks.gericht.select}
          {...flow.pick('gericht')}
          avatar="none"
          searchPlaceholder={tx('Gericht suchen …')}
        />
      </WizardStep>
      <WizardStep label={tx('Ergebnis')} description={tx('Hat es gut geklappt und wie war es?')} needs={['gericht']}>
        <div className="space-y-4">
          <Bound form={flow.forms.kochtagebuch} name="geklappt" />
          <Bound form={flow.forms.kochtagebuch} name="bewertung" allowClear />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={tx('Dauer & Anmerkungen')}
          />
        </div>
      </WizardStep>
      <WizardStep label={tx('Details')} description={tx('Wie lange hat es gedauert und was merkst du dir?')} needs={['gericht']}>
        <div className="space-y-4">
          <Bound
            form={flow.forms.kochtagebuch}
            name="tatsaechliche_dauer"
            hint={geplant != null ? tx`Im Rezept sind ${geplant} Minuten vorgesehen.` : undefined}
          />
          <Bound form={flow.forms.kochtagebuch} name="anmerkungen" rows={4} />
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => flow.validateStep(3)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'gekocht_am', label: tx('Gekocht am'), value: format(new Date(), 'dd.MM.yyyy') }]}
            whatHappensNext={tx('Der Eintrag erscheint sofort in deinem Kochtagebuch.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          next={[
            { label: tx('Einkauf planen'), href: '#/intents/einkauf-planen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
