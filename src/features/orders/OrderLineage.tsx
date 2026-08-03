import { Fragment } from 'react';
import { Link, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Callout } from '@/components/design';

type LineageItem = { id: string; order_code: string };

type Props = {
  orderId?: string;
  /** Role-aware link base: '/doctor/orders' or '/lab/orders'. */
  basePath: string;
  /** Already-translated "Continues from" label (keeps this namespace-agnostic). */
  label: string;
};

/**
 * Walks an order's ancestry via continues_order_id and renders a compact
 * "continues from" trail of clickable ancestor codes (root → … → parent), each
 * opening in a new tab. Renders nothing when the order has no parent.
 */
export function OrderLineage({ orderId, basePath, label }: Props) {
  const { data: chain = [] } = useQuery({
    queryKey: ['order-lineage', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      // Read this order's parent pointer, then hop upward. Cap the walk and
      // track visited ids so a stray cycle can never loop forever.
      const acc: LineageItem[] = [];
      const seen = new Set<string>([orderId!]);

      const head = await supabase
        .from('orders')
        .select('continues_order_id')
        .eq('id', orderId!)
        .maybeSingle();
      let nextId = (head.data?.continues_order_id as string | null) ?? null;

      let hops = 0;
      while (nextId && hops < 20 && !seen.has(nextId)) {
        seen.add(nextId);
        const { data } = await supabase
          .from('orders')
          .select('id, order_code, continues_order_id')
          .eq('id', nextId)
          .maybeSingle();
        if (!data) break;
        acc.push({ id: data.id as string, order_code: data.order_code as string });
        nextId = (data.continues_order_id as string | null) ?? null;
        hops += 1;
      }

      // acc is immediate parent → … → root; reverse to read root → … → parent.
      return acc.reverse();
    },
  });

  if (chain.length === 0) return null;

  return (
    <Callout tone="brand" icon="repeat">
      <Stack
        component="span"
        direction="row"
        alignItems="center"
        sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 0.75 }}
      >
        <Typography component="span" variant="body1" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {chain.map((item, i) => (
          <Fragment key={item.id}>
            {i > 0 && (
              <Typography component="span" variant="body1" color="text.secondary">
                ›
              </Typography>
            )}
            <Link
              href={`${basePath}/${item.id}`}
              target="_blank"
              rel="noopener"
              variant="body1"
            >
              {item.order_code}
            </Link>
          </Fragment>
        ))}
      </Stack>
    </Callout>
  );
}
