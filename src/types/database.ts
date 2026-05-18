// Hand-written shim. Run `supabase gen types typescript --linked` later to
// auto-regenerate.

export type UserRole = 'DOCTOR' | 'LAB_MAIN_ADMIN' | 'PLATFORM_ADMIN' | 'CLINIC_ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';
export type LabApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED_ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED';
export type ColorModePref = 'light' | 'dark' | 'system';
export type LangCode = 'en' | 'ka' | 'ru';

export type ServicePhaseType = 'TEMPORARY' | 'FINAL' | 'STANDALONE';
export type FormStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';
export type OrderStatus =
  | 'SUBMITTED'
  | 'RECEIVED'
  | 'NEEDS_CLARIFICATION'
  | 'IN_PROGRESS'
  | 'READY_FOR_DELIVERY'
  | 'SENT_TO_CLINIC'
  | 'RECEIVED_BY_CLINIC'
  | 'TRY_IN_PHASE'
  | 'COMPLETED'
  | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type InvoiceRecipientType = 'DOCTOR' | 'CLINIC';
export type RushType = 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT';
export type PricingModel = 'UNIT_BASED' | 'FIXED_PRICE';

export type MaterialOption = {
  id: string;
  name: string;
  /** Optional during editing (empty input → undefined). Treated as 0 by
   *  pricing math; `isPricingComplete` rejects an unset/zero price for
   *  publishable forms. */
  unit_price?: number;
};
export type FileSource = 'ORDER_FORM' | 'CHAT' | 'ADMIN_UPLOAD';

export interface AppUserRow {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  account_status: AccountStatus;
  preferred_lang: LangCode;
  preferred_color_mode: ColorModePref;
  created_at: string;
  updated_at: string;
}

export interface DoctorProfileRow {
  id: string;
  user_id: string;
  personal_id_number: string;
  specialty: string | null;
  license_number: string | null;
  profile_photo_url: string | null;
  created_at: string;
}

export interface DoctorWorkLocationRow {
  id: string;
  doctor_id: string;
  clinic_name: string;
  branch_name: string | null;
  address: string;
  city: string;
  clinic_identification_code: string | null;
  clinic_invoice_email: string | null;
  phone: string | null;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
}

export interface LabRow {
  id: string;
  owner_user_id: string;
  public_name: string;
  legal_name: string | null;
  identification_code: string | null;
  legal_address: string | null;
  working_address: string | null;
  city: string | null;
  country: string | null;
  contact_person_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  bank_name: string | null;
  bank_account_iban: string | null;
  payment_instructions: string | null;
  logo_url: string | null;
  short_description: string | null;
  approval_status: LabApprovalStatus;
  approval_note: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LabServiceRow {
  id: string;
  lab_id: string;
  name: string;
  short_description: string | null;
  average_turnaround_days: number | null;
  average_turnaround_label: string | null;
  cover_image_url: string | null;
  linked_lab_form_id: string | null;
  service_phase_type: ServicePhaseType;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformFormTemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface PlatformTemplateFieldRow {
  id: string;
  template_id: string;
  field_code: string;
  field_type: string;
  label: string;
  default_settings: Record<string, unknown>;
  sort_order: number;
  created_at: string;
}

export interface LabFormRow {
  id: string;
  lab_id: string;
  service_id: string | null;
  template_id: string;
  title: string;
  status: FormStatus;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export type FieldConfig = {
  code: string;
  type: string;
  label: string;
  enabled: boolean;
  required: boolean;
  helper_text?: string;
  default_value?: unknown;
  affects_price?: boolean;
  visible_to_doctor?: boolean;
  options?: string[];
};

export type FormConfiguration = {
  fields: FieldConfig[];
  /** Platform template code (e.g. 'CROWN_AND_BRIDGE') — drives specialized
   * renderers when present. Optional for backward compatibility. */
  _templateCode?: string;
};

export type SgSupportFee = {
  supportType: string;
  extra_fee: number;
};

export type ImplantPricingMode =
  | 'fixed'
  | 'per_implant'
  | 'per_bar_implant'
  | 'base_plus_per_implant';

export type ImplantPriceItem = {
  key: string;
  label: string;
  price: number;
  pricingMode: ImplantPricingMode;
  basePrice?: number;
  perImplantPrice?: number;
  enabled: boolean;
};

export type PricingConfig = {
  model: PricingModel;
  /** Used by non-CnB UNIT_BASED forms (single global unit price × tooth count). */
  unit_price?: number;
  fixed_price?: number;
  /** CnB UNIT_BASED: lab-defined materials. */
  materials?: MaterialOption[];
  /** Surgical Guide — Pilot Guide price per implant. */
  sg_pilot_unit_price?: number;
  /** Surgical Guide — Full Protocol Guide price per implant. */
  sg_full_protocol_unit_price?: number;
  /** Surgical Guide — optional extra fee per guide support type. */
  sg_support_fees?: SgSupportFee[];
  /** Evident Smile Package — extra fee when doctor opts for gingival reduction guide. */
  esp_gingival_reduction_price?: number;
  /** Constructions on Implants — lab-configured implant brands. */
  implant_brands?: { id: string; name: string }[];
  /** Constructions on Implants — per-item price config for the connection tree. */
  implant_price_config?: Record<string, ImplantPriceItem>;
  /** Constructions on Implants — lab-defined final crown materials (name + price per tooth). */
  implant_crown_materials?: MaterialOption[];
  /**
   * Rush surcharge config.
   *  - type=NONE means rush is disabled — doctor can't pick rush.
   */
  rush: { type: RushType; value?: number; turnaround_days?: number };
};

export interface LabFormVersionRow {
  id: string;
  lab_form_id: string;
  version_number: number;
  configuration_json: FormConfiguration;
  pricing_configuration_json: PricingConfig;
  status: FormStatus;
  created_at: string;
}

export interface PatientRow {
  id: string;
  doctor_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  created_at: string;
}

export interface OrderRow {
  id: string;
  order_code: string;
  doctor_id: string;
  lab_id: string;
  doctor_work_location_id: string;
  patient_id: string;
  patient_case_id: string | null;
  parent_order_id: string | null;
  lab_service_id: string;
  lab_form_version_id: string;
  status: OrderStatus;
  requested_due_date: string | null;
  confirmed_due_date: string | null;
  invoice_recipient_type: InvoiceRecipientType;
  generated_total: number | null;
  final_total: number | null;
  rush_type: RushType;
  rush_value: number | null;
  paid_total: number;
  payment_status: PaymentStatus;
  pricing_needs_review: boolean;
  invoice_needs_revision: boolean;
  work_location_snapshot: Record<string, unknown>;
  lab_snapshot: Record<string, unknown>;
  service_snapshot: Record<string, unknown>;
  invoice_recipient_snapshot: Record<string, unknown>;
  doctor_snapshot: {
    first_name?: string;
    last_name?: string;
    email?: string | null;
    phone?: string | null;
  };
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderAnswerRow {
  id: string;
  order_id: string;
  field_code: string;
  answer_json: unknown;
  created_at: string;
}

export interface OrderFileRow {
  id: string;
  order_id: string;
  uploaded_by_user_id: string;
  uploaded_by_role: UserRole;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  file_source: FileSource;
  created_at: string;
}
