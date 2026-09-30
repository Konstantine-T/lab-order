import { useAuth } from '@/auth/AuthProvider';

/** Admins receive feedback; they don't send it. */
export function useCanSendFeedback() {
  const { user } = useAuth();
  return !!user && user.role !== 'PLATFORM_ADMIN';
}
