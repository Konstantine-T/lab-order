import { z } from 'zod';

export const labProfileSchema = z.object({
  public_name: z.string().min(2),
  short_description: z.string().optional().or(z.literal('')),
  logo_url: z.string().url().optional().or(z.literal('')),
  legal_name: z.string().min(2),
  identification_code: z.string().min(2),
  legal_address: z.string().min(3),
  working_address: z.string().min(3),
  city: z.string().min(2),
  country: z.string().min(2),
  contact_person_name: z.string().min(2),
  contact_phone: z.string().min(3),
  contact_email: z.string().email(),
  bank_name: z.string().min(2),
  bank_account_iban: z.string().min(4),
  payment_instructions: z.string().min(2),
});

export type LabProfileInput = z.infer<typeof labProfileSchema>;

export const requiredFieldKeys: (keyof LabProfileInput)[] = [
  'public_name',
  'legal_name',
  'identification_code',
  'legal_address',
  'working_address',
  'city',
  'country',
  'contact_person_name',
  'contact_phone',
  'contact_email',
  'bank_name',
  'bank_account_iban',
  'payment_instructions',
];

export function isLabProfileComplete(values: Partial<LabProfileInput>): boolean {
  return requiredFieldKeys.every((key) => {
    const v = values[key];
    return typeof v === 'string' && v.trim().length > 0;
  });
}
