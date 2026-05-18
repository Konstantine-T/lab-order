import { z } from 'zod';

export const serviceBasicsSchema = z.object({
  name: z.string().min(2),
  short_description: z.string().optional().or(z.literal('')),
  average_turnaround_days: z
    .string()
    .regex(/^\d+$/, 'Enter a positive integer')
    .refine((v) => Number(v) >= 1, 'Must be at least 1 day'),
  cover_image_url: z.string().url().optional().or(z.literal('')),
  is_active: z.boolean(),
});

export type ServiceBasicsInput = z.infer<typeof serviceBasicsSchema>;

export const emptyServiceBasics: ServiceBasicsInput = {
  name: '',
  short_description: '',
  average_turnaround_days: '1',
  cover_image_url: '',
  is_active: true,
};

/**
 * Convert form values to a DB row.
 *
 * Note: `service_phase_type` and `average_turnaround_label` exist on the
 * `lab_services` table but are no longer edited from the UI — the column
 * defaults / existing values stay untouched on update.
 */
export function basicsToRow(values: ServiceBasicsInput) {
  return {
    name: values.name,
    short_description: values.short_description || null,
    average_turnaround_days:
      values.average_turnaround_days && values.average_turnaround_days !== ''
        ? Number(values.average_turnaround_days)
        : null,
    cover_image_url: values.cover_image_url || null,
    is_active: values.is_active,
  };
}
