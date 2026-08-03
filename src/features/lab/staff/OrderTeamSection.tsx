import { useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  Divider,
  Link as MuiLink,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, SectionCard } from '@/components/design';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type {
  CreateOrderChatResult,
  LabStaffRow,
  OrderChatRow,
  OrderStaffAssignmentRow,
} from '@/types/database';

type AssignmentWithStaff = OrderStaffAssignmentRow & {
  lab_staff: Pick<LabStaffRow, 'id' | 'first_name' | 'last_name' | 'phone' | 'archived_at'> | null;
};

type Props = {
  orderId: string;
  labId: string;
  /** Terminal order — assignments are read-only (RLS enforces this too). */
  disabled?: boolean;
};

/**
 * "Team" card on the lab order sheet: shows which staff members are assigned
 * to this order and lets the lab owner assign/unassign active staff.
 */
export function OrderTeamSection({ orderId, labId, disabled = false }: Props) {
  const { t } = useTranslation('lab');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const qc = useQueryClient();

  const [pending, setPending] = useState<LabStaffRow | null>(null);

  const { data: staff = [] } = useQuery({
    queryKey: ['lab-staff', labId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lab_staff')
        .select('*')
        .eq('lab_id', labId)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LabStaffRow[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['order-staff', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_staff_assignments')
        .select('*, lab_staff(id, first_name, last_name, phone, archived_at)')
        .eq('order_id', orderId)
        .order('assigned_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentWithStaff[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['order-staff', orderId] });
  const [actionError, setActionError] = useState(false);

  const assign = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase.from('order_staff_assignments').insert({
        order_id: orderId,
        staff_id: staffId,
        assigned_by_user_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onError: () => setActionError(true),
    // Refresh the list on both success and failure — a failed assign is usually a
    // lost race (already assigned / order went terminal), so the stale option
    // should disappear either way.
    onSettled: invalidate,
  });

  const unassign = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('order_staff_assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onError: () => setActionError(true),
    onSettled: invalidate,
  });

  // Existing Telegram chat for this order, if any. The lab owner can read the
  // full order_chats row (RLS); doctors get the invite link via an RPC instead.
  const { data: chat } = useQuery({
    queryKey: ['order-chat', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_chats')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      return (data as OrderChatRow | null) ?? null;
    },
  });

  const createChat = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<CreateOrderChatResult>(
        'create-order-chat',
        { body: { order_id: orderId } },
      );
      if (error) throw error;
      return data as CreateOrderChatResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-chat', orderId] }),
  });

  const [copied, setCopied] = useState(false);
  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the link is still visible to copy manually
    }
  };

  const assignedStaffIds = useMemo(
    () => new Set(assignments.map((a) => a.staff_id)),
    [assignments],
  );
  const assignable = staff.filter((s) => !assignedStaffIds.has(s.id));

  // From either the freshly-created result or the persisted row.
  const inviteLink = chat?.invite_link ?? createChat.data?.invite_link ?? null;
  const unadded = chat?.unadded_members ?? createChat.data?.unadded_members ?? [];

  return (
    <SectionCard icon="groups" title={t('staff.team.title')} meta={t('staff.team.subtitle')}>
        <Stack spacing={2}>
          {assignments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('staff.team.empty')}
            </Typography>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {assignments.map((a) => {
                const name = a.lab_staff
                  ? `${a.lab_staff.first_name} ${a.lab_staff.last_name}`
                  : '—';
                return (
                  <Chip
                    key={a.id}
                    label={name}
                    variant={a.lab_staff?.archived_at ? 'outlined' : 'filled'}
                    onDelete={
                      disabled || unassign.isPending ? undefined : () => unassign.mutate(a.id)
                    }
                  />
                );
              })}
            </Stack>
          )}

          {!disabled &&
            (staff.length === 0 ? (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" color="text.secondary">
                  {t('staff.team.noStaff')}
                </Typography>
                <Button component={RouterLink} to="/lab/staff" size="small">
                  {t('staff.team.goToStaff')}
                </Button>
              </Stack>
            ) : (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 260 }}
                  options={assignable}
                  value={pending}
                  onChange={(_, v) => setPending(v)}
                  getOptionLabel={(s) => `${s.first_name} ${s.last_name}`}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={(params) => (
                    <TextField {...params} label={t('staff.team.assignLabel')} />
                  )}
                />
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!pending || assign.isPending}
                  onClick={() => {
                    if (!pending) return;
                    // Clear on settle (not just success) so a failed/raced assign
                    // doesn't leave the picker stuck holding the selection.
                    assign.mutate(pending.id, { onSettled: () => setPending(null) });
                  }}
                >
                  {t('staff.team.assignAction')}
                </Button>
              </Stack>
            ))}

          {/* Telegram chat: create a group with the assigned team + doctor + lab. */}
          {assignments.length > 0 && (
            <>
              <Divider />
              <Stack spacing={1.5}>
                {inviteLink ? (
                  <>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ sm: 'center' }}
                    >
                      <Button
                        component={MuiLink}
                        href={inviteLink}
                        target="_blank"
                        rel="noopener"
                        variant="contained"
                        size="small"
                        startIcon={<Icon name="send" size={17} />}
                      >
                        {t('staff.team.chat.open')}
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Icon name="content_copy" size={16} />}
                        onClick={() => copyLink(inviteLink)}
                      >
                        {copied ? t('staff.team.chat.copied') : t('staff.team.chat.copyLink')}
                      </Button>
                    </Stack>
                    {unadded.length > 0 && (
                      <Alert severity="info" variant="outlined">
                        <Typography variant="body2" gutterBottom>
                          {t('staff.team.chat.unaddedHint')}
                        </Typography>
                        <Stack component="ul" sx={{ m: 0, pl: 2 }} spacing={0.25}>
                          {unadded.map((m, i) => (
                            <li key={`${m.phone ?? m.name}-${i}`}>
                              <Typography variant="body2">
                                {m.name}
                                {m.phone ? ` — ${m.phone}` : ''}
                              </Typography>
                            </li>
                          ))}
                        </Stack>
                      </Alert>
                    )}
                  </>
                ) : (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<Icon name="send" size={17} />}
                      disabled={disabled || createChat.isPending}
                      onClick={() => createChat.mutate()}
                    >
                      {createChat.isPending
                        ? t('staff.team.chat.creating')
                        : t('staff.team.chat.create')}
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      {t('staff.team.chat.createHint')}
                    </Typography>
                  </Stack>
                )}

                {createChat.isError && (
                  <Alert severity="error" variant="outlined">
                    {t('staff.team.chat.error')}
                  </Alert>
                )}
              </Stack>
            </>
          )}
        </Stack>

        <Snackbar
          open={actionError}
          autoHideDuration={5000}
          onClose={() => setActionError(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity="error" onClose={() => setActionError(false)} variant="filled">
            {tc('errors.generic')}
          </Alert>
        </Snackbar>
    </SectionCard>
  );
}
