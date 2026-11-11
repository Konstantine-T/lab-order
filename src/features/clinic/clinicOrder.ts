import type { TFunction } from 'i18next';
import type { ClinicRow } from '@/types/database';
import { invoiceLine } from '@/features/labBuying/buyerOrder';

/**
 * What an order placed for a clinic (0050) is delivered and invoiced to. The
 * server fills both from the clinic; the wizard only shows them, read-only,
 * in the lines a lab's purchase uses (0048).
 */
export type ClinicForOrder = {
  id: string;
  /** The public name: what the lab and the doctor know it by. */
  name: string;
  city: string | null;
  /** Null until the clinic fills it in; nobody can order for it until then. */
  workingAddress: string | null;
  /** Legal name, else the public one: who the invoice is made out to. */
  legalName: string;
  identificationCode: string | null;
  /**
   * The profile is complete, so it can be ordered for (0058): name, delivery
   * address, city, legal name, ს/კ and invoice email. Until then the wizard
   * disables it and the server refuses with clinic_details_missing.
   */
  ready: boolean;
};

const filled = (v: string | null | undefined) => !!v && v.trim() !== '';

/** 0058's `_clinic_ready_for_orders`, for the clinic's own row. */
export function clinicReadyForOrders(
  row: Pick<
    ClinicRow,
    'public_name' | 'working_address' | 'city' | 'legal_name' | 'identification_code' | 'invoice_email'
  >,
): boolean {
  return (
    filled(row.public_name) &&
    filled(row.working_address) &&
    filled(row.city) &&
    filled(row.legal_name) &&
    filled(row.identification_code) &&
    filled(row.invoice_email)
  );
}

/** The clinic admin's own clinic, from the session's row. */
export function clinicForOrder(row: ClinicRow): ClinicForOrder {
  return {
    id: row.id,
    name: row.public_name,
    city: row.city?.trim() || null,
    workingAddress: row.working_address?.trim() || null,
    legalName: row.legal_name?.trim() || row.public_name,
    identificationCode: row.identification_code?.trim() || null,
    ready: clinicReadyForOrders(row),
  };
}

/** "Smile Clinic, Rustaveli Ave 12, Tbilisi": where a clinic order goes. */
export function clinicDeliveryLine(c: ClinicForOrder): string {
  return [c.name, c.workingAddress, c.city]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/** "Smile LLC, ID 404123456": who a clinic order is invoiced to. `t` is `doctor`'s. */
export function clinicInvoiceLine(c: ClinicForOrder, t: TFunction): string {
  return invoiceLine(c.legalName, c.identificationCode, t);
}

/** The wizard's "For" value: a clinic id, or this for the doctor's own work. */
export const PRIVATE_ORDER = 'private';
