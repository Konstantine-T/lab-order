import { useTranslation } from 'react-i18next';
import { SectionChrome } from './primitives';
import { DynamicForm, validateFormAnswers } from '@/components/DynamicForm';
import type { FormConfiguration, PricingConfig } from '@/types/database';
import {
  CrownAndBridgeForm,
  coerceCnbAnswers,
  validateCnb,
  type CnbAnswers,
} from './CrownAndBridgeForm';
import { isCnbTemplate, emptyCnbAnswers } from './cnbTypes';
import {
  SurgicalGuideForm,
  coerceSgAnswers,
  validateSg,
  type SgAnswers,
} from './SurgicalGuideForm';
import { TEMPLATE_CODE_SG, emptySgAnswers } from './sgTypes';
import {
  ModelForm,
  coerceModelAnswers,
  validateModel,
  type ModelAnswers,
} from './ModelForm';
import { isModelTemplateCode, emptyModelAnswers } from './modelTypes';
import {
  EspForm,
  coerceEspAnswers,
  validateEsp,
  type EspAnswers,
} from './EspForm';
import { TEMPLATE_CODE_ESP, emptyEspAnswers } from './espTypes';
import {
  ImplantRestorationForm,
  coerceImplantAnswers,
  validateImplantRestoration,
  emptyImplantAnswers,
  TEMPLATE_CODE_IMPLANT,
  type ImplantRestorationAnswers,
} from './ImplantRestorationForm';
import {
  GingivalReductionGuideForm,
  coerceGrgAnswers,
  validateGrg,
  emptyGrgAnswers,
  type GrgAnswers,
} from './GingivalReductionGuideForm';
import { TEMPLATE_CODE_GRG } from './grgTypes';
import { PrintForm, MillingForm } from './FabForm';
import {
  TEMPLATE_CODE_PRINT,
  TEMPLATE_CODE_MILLING,
  coercePrintAnswers,
  coerceMillingAnswers,
  validatePrint,
  validateMilling,
  emptyPrintAnswers,
  emptyMillingAnswers,
} from './fabTypes';

export type OrderFormValue = Record<string, unknown>;

/**
 * The lab's appended questions on their own.
 *
 * Validation has to run against just these. A template's own answers are not
 * `fields` — they are typed keys checked by `validateCnb` and friends — so
 * handing the whole configuration to `validateFormAnswers` would check the
 * lab's questions and nothing else anyway; narrowing it says so out loud.
 */
function customQuestionsOnly(configuration: FormConfiguration): FormConfiguration {
  return {
    ...configuration,
    fields: configuration.fields.filter((f) => f.type === 'custom_question'),
  };
}

type Props = {
  configuration: FormConfiguration;
  /** Required for CnB to render materials. Optional for non-CnB forms. */
  pricing?: PricingConfig;
  values: OrderFormValue;
  onChange: (next: OrderFormValue) => void;
  readOnly?: boolean;
  /** Show inline validation errors (set after submit attempt). */
  showErrors?: boolean;
};

/**
 * Renders the right dental form for a template.
 *
 * Editable renderings put every numbered section in its own card — the wizard
 * layout from the mockups. Read-only ones render plain, because the order
 * detail screens already wrap the whole answer set in one card.
 */
export function OrderForm(props: Props) {
  return (
    <SectionChrome value={props.readOnly ? 'plain' : 'card'}>
      <OrderFormBody {...props} />
    </SectionChrome>
  );
}

function OrderFormBody({
  configuration,
  pricing,
  values,
  onChange,
  readOnly,
  showErrors,
}: Props) {
  const { t } = useTranslation('common');

  // The lab's appended questions are rendered by the template form itself, so
  // they can take the next section number. Identical for every template, so
  // it's built once here and spread in.
  const customProps = {
    rawValues: values,
    onRawChange: onChange,
    customErrors: showErrors
      ? validateFormAnswers(customQuestionsOnly(configuration), values, t('errors.required'))
      : undefined,
  };

  if (isCnbTemplate(configuration._templateCode)) {
    const cnb = coerceCnbAnswers(values, pricing?.materials);
    return (
      <CrownAndBridgeForm
        configuration={configuration}
        pricing={pricing}
        value={cnb}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_SG) {
    const sg = coerceSgAnswers(values);
    return (
      <SurgicalGuideForm
        configuration={configuration}
        pricing={pricing}
        value={sg}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_IMPLANT) {
    const implant = coerceImplantAnswers(values);
    return (
      <ImplantRestorationForm
        configuration={configuration}
        pricing={pricing}
        value={implant}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_GRG) {
    const grg = coerceGrgAnswers(values);
    return (
      <GingivalReductionGuideForm
        configuration={configuration}
        pricing={pricing}
        value={grg}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_ESP) {
    const esp = coerceEspAnswers(values);
    return (
      <EspForm
        configuration={configuration}
        pricing={pricing}
        value={esp}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  if (isModelTemplateCode(configuration._templateCode)) {
    const model = coerceModelAnswers(values);
    return (
      <ModelForm
        configuration={configuration}
        pricing={pricing}
        value={model}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_PRINT) {
    const print = coercePrintAnswers(values);
    return (
      <PrintForm
        configuration={configuration}
        pricing={pricing}
        value={print}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_MILLING) {
    const milling = coerceMillingAnswers(values);
    return (
      <MillingForm
        configuration={configuration}
        pricing={pricing}
        value={milling}
        onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
        readOnly={readOnly}
        showErrors={showErrors}
        {...customProps}
      />
    );
  }

  return (
    <DynamicForm
      configuration={configuration}
      values={values}
      onChange={onChange}
      readOnly={readOnly}
      errors={showErrors ? validateFormAnswers(configuration, values, t('errors.required')) : undefined}
    />
  );
}

// ===== Validation helper used by the wizard ===============================
export function isOrderFormValid(
  configuration: FormConfiguration,
  values: OrderFormValue,
  pricing?: PricingConfig,
): boolean {
  // A required question the lab appended blocks submit exactly like one of the
  // template's own required fields. Until now it was rendered, starred, and
  // then ignored: every branch below validates only its own typed answers, so
  // the doctor could leave a required question blank and still submit.
  if (Object.keys(validateFormAnswers(customQuestionsOnly(configuration), values)).length > 0) {
    return false;
  }

  if (isCnbTemplate(configuration._templateCode)) {
    const cnb = coerceCnbAnswers(values, pricing?.materials);
    return Object.keys(validateCnb(cnb, configuration)).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_SG) {
    const sg = coerceSgAnswers(values);
    return Object.keys(validateSg(sg)).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_ESP) {
    const esp = coerceEspAnswers(values);
    return Object.keys(validateEsp(esp, configuration)).length === 0;
  }
  if (isModelTemplateCode(configuration._templateCode)) {
    const model = coerceModelAnswers(values);
    return Object.keys(validateModel(model, configuration)).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_IMPLANT) {
    const implant = coerceImplantAnswers(values);
    return Object.keys(validateImplantRestoration(implant)).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_GRG) {
    const grg = coerceGrgAnswers(values);
    return Object.keys(validateGrg(grg, configuration)).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_PRINT) {
    return Object.keys(validatePrint(coercePrintAnswers(values))).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_MILLING) {
    return Object.keys(validateMilling(coerceMillingAnswers(values))).length === 0;
  }
  return Object.keys(validateFormAnswers(configuration, values)).length === 0;
}

export { emptyCnbAnswers, emptySgAnswers, emptyModelAnswers, emptyEspAnswers, emptyImplantAnswers, emptyGrgAnswers, emptyPrintAnswers, emptyMillingAnswers };
export type { CnbAnswers, SgAnswers, ModelAnswers, EspAnswers, ImplantRestorationAnswers, GrgAnswers };
