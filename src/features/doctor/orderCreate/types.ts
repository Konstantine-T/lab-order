import type { InvoiceRecipientType } from '@/types/database';

export type WizardState = {
  // Step 1
  patient: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string;
    existing_id?: string;
  };
  // Step 2
  lab_id: string;
  lab_service_id: string;
  // Step 3
  answers: Record<string, unknown>;
  // Step 4
  doctor_work_location_id: string;
  requested_due_date: string;
  /** True when the doctor opts into the lab's pre-configured rush surcharge.
   * The actual rush_type/rush_value sent to the server is derived from the
   * lab's PricingConfig.rush at submit time. */
  rush_requested: boolean;
  // Step 5
  invoice_recipient_type: InvoiceRecipientType;
};

export const initialState: WizardState = {
  patient: { first_name: '', last_name: '', date_of_birth: '', gender: '' },
  lab_id: '',
  lab_service_id: '',
  answers: {},
  doctor_work_location_id: '',
  requested_due_date: '',
  rush_requested: false,
  invoice_recipient_type: 'DOCTOR',
};
