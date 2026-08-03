import { Stack } from '@mui/material';
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
  // Cards carry their own padding, so they need less air between them than
  // the plain read-only sections do.
  const gap = readOnly ? 4 : 2;

  if (isCnbTemplate(configuration._templateCode)) {
    const cnb = coerceCnbAnswers(values, pricing?.materials);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <CrownAndBridgeForm
          configuration={configuration}
          pricing={pricing}
          value={cnb}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_SG) {
    const sg = coerceSgAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <SurgicalGuideForm
          configuration={configuration}
          pricing={pricing}
          value={sg}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_IMPLANT) {
    const implant = coerceImplantAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <ImplantRestorationForm
          configuration={configuration}
          pricing={pricing}
          value={implant}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_GRG) {
    const grg = coerceGrgAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <GingivalReductionGuideForm
          configuration={configuration}
          pricing={pricing}
          value={grg}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_ESP) {
    const esp = coerceEspAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <EspForm
          configuration={configuration}
          pricing={pricing}
          value={esp}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  if (isModelTemplateCode(configuration._templateCode)) {
    const model = coerceModelAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <ModelForm
          configuration={configuration}
          pricing={pricing}
          value={model}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_PRINT) {
    const print = coercePrintAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <PrintForm
          pricing={pricing}
          value={print}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  if (configuration._templateCode === TEMPLATE_CODE_MILLING) {
    const milling = coerceMillingAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={gap}>
        <MillingForm
          pricing={pricing}
          value={milling}
          onChange={(next) => onChange({ ...values, ...(next as unknown as OrderFormValue) })}
          readOnly={readOnly}
          showErrors={showErrors}
        />
        {customFields.length > 0 && (
          <DynamicForm
            configuration={{ ...configuration, fields: customFields }}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        )}
      </Stack>
    );
  }

  return (
    <DynamicForm
      configuration={configuration}
      values={values}
      onChange={onChange}
      readOnly={readOnly}
      errors={showErrors ? validateFormAnswers(configuration, values) : undefined}
    />
  );
}

// ===== Validation helper used by the wizard ===============================
export function isOrderFormValid(
  configuration: FormConfiguration,
  values: OrderFormValue,
  pricing?: PricingConfig,
): boolean {
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
