import { useAuth } from '@/auth/AuthProvider';
import { TrashPage } from '@/features/orders/trash/TrashPage';

/** `/lab/trash`: the incoming orders this lab deleted (0054, side LAB). */
export function LabTrashPage() {
  const { user } = useAuth();
  const labId = user?.lab?.id;
  return <TrashPage scope={labId ? { side: 'LAB', labId } : null} ordersPath="/lab/orders" />;
}
