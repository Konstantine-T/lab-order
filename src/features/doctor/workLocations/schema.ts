import { z } from 'zod';

export const workLocationSchema = z.object({
  clinic_name: z.string().min(2),
  branch_name: z.string().optional().or(z.literal('')),
  address: z.string().min(3),
  city: z.string().min(2),
  clinic_identification_code: z.string().optional().or(z.literal('')),
  clinic_invoice_email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  is_default: z.boolean().default(false),
});

export type WorkLocationInput = z.infer<typeof workLocationSchema>;
