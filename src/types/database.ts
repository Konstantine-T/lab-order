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

/**
 * What the lab may set from its own order sheet.
 *
 * COMPLETED is deliberately absent: closing a case is the doctor's call (0022),
 * since only the doctor knows whether the work actually seated. The lab drives
 * the case as far as SENT_TO_CLINIC and stops there.
 */
export const LAB_SELECTABLE_STATUSES = [
  'RECEIVED',
  'NEEDS_CLARIFICATION',
  'IN_PROGRESS',
  'READY_FOR_DELIVERY',
  'SENT_TO_CLINIC',
] as const satisfies readonly OrderStatus[];

/** The doctor can accept a case only once the lab has handed it over. */
export const COMPLETABLE_STATUSES = [
  'SENT_TO_CLINIC',
  'RECEIVED_BY_CLINIC',
] as const satisfies readonly OrderStatus[];

export const canComplete = (status: OrderStatus): boolean =>
  (COMPLETABLE_STATUSES as readonly OrderStatus[]).includes(status);
export type InvoiceRecipientType = 'DOCTOR' | 'CLINIC';
export type RushType = 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT';
/**
 * How a service is priced.
 *
 * `LAB_DESCRIBED` is the escape hatch: some services price on so many variables
 * that no structured config captures them without becoming unusable. The lab
 * writes the prices out in its own words instead, the doctor reads them when
 * ordering, and the lab sets the authoritative `final_total` afterwards — the
 * same confirmation step every order already goes through.
 */
export type PricingModel = 'UNIT_BASED' | 'FIXED_PRICE' | 'LAB_DESCRIBED';

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

export interface ClinicRow {
  id: string;
  owner_user_id: string;
  public_name: string;
  legal_name: string | null;
  identification_code: string | null;
  legal_address: string | null;
  city: string | null;
  country: string | null;
  contact_person_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabStaffRow {
  id: string;
  lab_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  telegram_user_id: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderStaffAssignmentRow {
  id: string;
  order_id: string;
  staff_id: string;
  assigned_by_user_id: string | null;
  assigned_at: string;
}

export interface OrderChatRow {
  order_id: string;
  telegram_chat_id: number;
  invite_link: string;
  unadded_members: { name: string; phone: string | null; reason: string }[];
  created_by_user_id: string | null;
  created_at: string;
}

/** Row shape returned by the get_order_staff() RPC (names only — no contact info). */
export interface OrderStaffPublicRow {
  staff_id: string;
  first_name: string;
  last_name: string;
  assigned_at: string;
}

/**
 * Row shape returned by the get_order_chat() RPC — the doctor-safe view of a
 * chat: invite link only, never phones / telegram_chat_id / unadded_members.
 */
export interface OrderChatPublicRow {
  order_id: string;
  invite_link: string;
}

/** Response of the create-order-chat Edge Function (lab-side). */
export interface CreateOrderChatResult {
  invite_link: string | null;
  chat_id: number | null;
  unadded_members: { name: string; phone: string | null; reason: string }[];
}

export type ClinicInviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';

export interface ClinicDoctorInviteRow {
  id: string;
  clinic_id: string;
  doctor_email: string;
  status: ClinicInviteStatus;
  invited_by_user_id: string | null;
  created_at: string;
  responded_at: string | null;
}

/** Row shape returned by the clinic_doctors() RPC. */
export interface ClinicDoctorRow {
  doctor_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  specialty: string | null;
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
  /** LAB_DESCRIBED: the lab's own prose price list, shown to the doctor as-is. */
  price_description?: string;
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
  /** Model printing (MODEL / TITANIUM_MILLING): price per jaw-model. Quantity is
   *  1 for a single arch (upper OR lower) and 2 for both. Its presence is also
   *  how the (template-code-free) price math detects a per-jaw Model config. */
  model_per_jaw_price?: number;
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
  /** Set by complete_order (0022) — who accepted the case, and when. */
  completed_at: string | null;
  completed_by_user_id: string | null;
  has_unreviewed_edits: boolean;
  edit_count: number;
  last_edited_at: string | null;
  /** Parent order this one continues from (same lab + same doctor), or null. */
  continues_order_id: string | null;
  created_at: string;
  updated_at: string;
}

// ===== Lab finances / receivables (server-aggregated RPCs) ==================
// Returned by the lab_receivables_* RPCs. Numeric columns may arrive as
// strings from PostgREST — coerce with Number() before formatting.

export interface LabReceivableCustomer {
  customer_type: InvoiceRecipientType;
  customer_id: string;
  customer_name: string;
  order_count: number;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
}

export interface LabReceivableOrder {
  order_id: string;
  order_code: string;
  order_status: OrderStatus;
  customer_type: InvoiceRecipientType;
  customer_id: string;
  customer_name: string;
  doctor_name: string | null;
  service_name: string;
  final_total: number;
  paid_total: number;
  outstanding: number;
  payment_status: PaymentStatus;
  confirmed_due_date: string | null;
  requested_due_date: string | null;
  created_at: string;
  /** Full filtered size for pagination (identical on every row of a page). */
  total_count: number;
}

/** One doctor's rolled-up position, from clinic_payables_by_doctor (0024). */
export interface ClinicPayableDoctor {
  doctor_id: string;
  doctor_name: string;
  order_count: number;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
}

/** One payable order, from clinic_payables_list (0024). */
export interface ClinicPayableOrder {
  order_id: string;
  order_code: string;
  order_status: OrderStatus;
  doctor_id: string;
  doctor_name: string;
  lab_id: string;
  lab_name: string;
  patient_name: string;
  service_name: string;
  recipient_type: InvoiceRecipientType;
  billed: number;
  paid_total: number;
  outstanding: number;
  payment_status: PaymentStatus;
  confirmed_due_date: string | null;
  requested_due_date: string | null;
  created_at: string;
  /** Full filtered size for pagination (identical on every row of a page). */
  total_count: number;
}

export type EditReasonCode =
  | 'CORRECTION'
  | 'UNFORESEEN_LAB_INSTRUCTION'
  | 'PATIENT_REASON'
  | 'CONSTRUCTION_DEFECT'
  | 'MY_MISTAKE'
  | 'UNFORESEEN_EVENT';

/** Pre-edit state captured server-side by edit_order before mutating the live
 * order. The RPC's snapshot JSON also carries a `patient` object, but it's
 * deliberately omitted here: patient PII is doctor-only and the only consumer
 * of this type is the lab edit-review, which must never read it. */
export interface OrderEditSnapshot {
  doctor_work_location_id: string;
  work_location_snapshot: Record<string, unknown>;
  invoice_recipient_type: InvoiceRecipientType;
  invoice_recipient_snapshot: Record<string, unknown>;
  requested_due_date: string | null;
  rush_type: RushType;
  rush_value: number | null;
  generated_total: number | null;
  answers: Record<string, unknown>;
}

export interface OrderEditRow {
  id: string;
  order_id: string;
  editor_user_id: string;
  reason_code: EditReasonCode;
  comment: string | null;
  snapshot_json: OrderEditSnapshot;
  created_at: string;
}

export interface OrderAnswerRow {
  id: string;
  order_id: string;
  field_code: string;
  answer_json: unknown;
  created_at: string;
}

/**
 * One "the lab asked, the doctor answered" exchange (0029).
 *
 * `answer` and `answered_at` move together — the table has a check constraint
 * saying so — and at most one row per order may be unanswered, so "is there an
 * open question?" is `answered_at === null` on the newest row.
 */
export interface OrderClarificationRow {
  id: string;
  order_id: string;
  asked_by_user_id: string;
  question: string;
  asked_at: string;
  answer: string | null;
  answered_by_user_id: string | null;
  answered_at: string | null;
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

export interface FeedbackRow {
  id: string;
  user_id: string;
  message: string;
  page_path: string | null;
  lang: string | null;
  /** Keys in the private `feedback-images` bucket, not URLs — the admin signs
   *  each one at read time. Empty when the sender attached nothing. */
  image_paths: string[];
  created_at: string;
}

/** One row of the `admin_feedback_list()` RPC: the message plus the sender's
 *  live contact card. `org_name` is the sender's lab or clinic name, null for
 *  doctors. */
export interface AdminFeedbackListRow {
  id: string;
  message: string;
  page_path: string | null;
  lang: string | null;
  created_at: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  org_name: string | null;
  image_paths: string[];
}
