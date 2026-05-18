import { Stack } from '@mui/material';
import { DynamicForm } from '@/components/DynamicForm';
import type { FormConfiguration, PricingConfig } from '@/types/database';
import {
  CrownAndBridgeForm,
  coerceCnbAnswers,
  validateCnb,
  type CnbAnswers,
} from './CrownAndBridgeForm';
import { TEMPLATE_CODE_CNB, emptyCnbAnswers } from './cnbTypes';
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
import { TEMPLATE_CODE_MODEL, emptyModelAnswers } from './modelTypes';

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

export function OrderForm({
  configuration,
  pricing,
  values,
  onChange,
  readOnly,
  showErrors,
}: Props) {
  if (configuration._templateCode === TEMPLATE_CODE_CNB) {
    const cnb = coerceCnbAnswers(values, pricing?.materials);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={4}>
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
      <Stack spacing={4}>
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

  if (configuration._templateCode === TEMPLATE_CODE_MODEL) {
    const model = coerceModelAnswers(values);
    const customFields = configuration.fields.filter(
      (f) => f.type === 'custom_question' && f.enabled,
    );
    return (
      <Stack spacing={4}>
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

  return (
    <DynamicForm
      configuration={configuration}
      values={values}
      onChange={onChange}
      readOnly={readOnly}
    />
  );
}

// ===== Validation helper used by the wizard ===============================
export function isOrderFormValid(
  configuration: FormConfiguration,
  values: OrderFormValue,
  pricing?: PricingConfig,
): boolean {
  if (configuration._templateCode === TEMPLATE_CODE_CNB) {
    const cnb = coerceCnbAnswers(values, pricing?.materials);
    return Object.keys(validateCnb(cnb, configuration)).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_SG) {
    const sg = coerceSgAnswers(values);
    return Object.keys(validateSg(sg)).length === 0;
  }
  if (configuration._templateCode === TEMPLATE_CODE_MODEL) {
    const model = coerceModelAnswers(values);
    return Object.keys(validateModel(model)).length === 0;
  }
  return true;
}

export { emptyCnbAnswers, emptySgAnswers, emptyModelAnswers };
export type { CnbAnswers, SgAnswers, ModelAnswers };
