import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { OrderChatPublicRow, OrderStaffPublicRow } from '@/types/database';

/**
 * Who at the lab is on this order, and its Telegram group — the two
 * participant-gated RPCs the order screens read.
 *
 * Both are the doctor-safe views: names only from get_order_staff() (doctors
 * have no direct read on lab_staff), and only the invite link from
 * get_order_chat() — never phones or unadded_members. A caller the RPC does
 * not recognise as a participant gets empty rows, not an error.
 */
export function useOrderContacts(orderId: string | undefined) {
  const { data: staff = [] } = useQuery({
    queryKey: ['order-staff-public', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_order_staff', {
        p_order_id: orderId!,
      });
      if (error) throw error;
      return (data ?? []) as OrderStaffPublicRow[];
    },
  });

  const { data: chat = null } = useQuery({
    queryKey: ['order-chat-public', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_order_chat', {
        p_order_id: orderId!,
      });
      if (error) throw error;
      return ((data as OrderChatPublicRow[] | null) ?? [])[0] ?? null;
    },
  });

  return { staff, chatLink: chat?.invite_link || null };
}
