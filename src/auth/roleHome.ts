import type { UserRole } from '@/types/database';

/** Where each role's own area starts — the only place a login may land. */
export const ROLE_HOME: Record<UserRole, string> = {
  DOCTOR: '/doctor',
  LAB_MAIN_ADMIN: '/lab',
  PLATFORM_ADMIN: '/admin',
  CLINIC_ADMIN: '/clinic',
};

export function roleHome(role: UserRole): string {
  return ROLE_HOME[role] ?? '/';
}
