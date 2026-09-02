import { useState } from 'react';
import { Box, Button, ButtonBase, Collapse, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Callout, Icon, SectionCard } from '@/components/design';
import type { OrderClarificationRow } from '@/types/database';
import {
  answerClarification,
  classifyClarificationError,
  clarificationsKey,
  fetchClarifications,
} from './clarificationsApi';

const fmt = (iso: string) => dayjs(iso).format('YYYY-MM-DD HH:mm');

/**
 * The lab's question and the doctor's answer, on every order screen.
 *
 * One component for all three roles, driven by `canAnswer` rather than by
 * sniffing the signed-in role: the doctor and the clinic admin acting for them
 * can answer, the lab reads. There is no empty state — with nothing to show the
 * panel renders nothing at all.
 */
export function ClarificationPanel({
  orderId,
  canAnswer,
}: {
  orderId: string;
  /** Doctor and clinic pass true; the lab passes false. */
  canAnswer: boolean;
}) {
  const { t } = useTranslation(['common', 'doctor', 'lab']);
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: clarificationsKey(orderId),
    queryFn: () => fetchClarifications(orderId),
  });

  const answer = useMutation({
    mutationFn: (v: { id: string; text: string }) => answerClarification(v.id, v.text),
    onSuccess: () => {
      setDraft('');
      setError(null);
      qc.invalidateQueries({ queryKey: clarificationsKey(orderId) });
      // The answer changes what both sides' badges and lists say about this
      // order, so refresh the lab's copy of it too — not just our own.
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['lab-order', orderId] });
      qc.invalidateQueries({ queryKey: ['nav-alerts'] });
    },
    onError: (e) =>
      setError(
        t(
          `common:errors.clarification.${classifyClarificationError(e)}` as
            'common:errors.clarification.generic',
        ),
      ),
  });

  if (rows.length === 0) return null;

  const [newest, ...older] = rows;
  const isOpen = newest.answered_at === null;

  return (
    <Stack spacing={1.5}>
      {isOpen ? (
        <>
          <Callout
            tone="warning"
            icon="help"
            title={
              <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
                {newest.question}
              </Box>
            }
          >
            {canAnswer
              ? t('doctor:orderDetail.clarification.body')
              : t('lab:orderSheet.clarification.awaitingAnswer')}
            {' · '}
            {t('common:clarification.askedOn', { date: fmt(newest.asked_at) })}
          </Callout>

          {canAnswer && (
            <Stack spacing={1}>
              <TextField
                label={t('doctor:orderDetail.clarification.answerLabel')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                multiline
                minRows={3}
                fullWidth
                disabled={answer.isPending}
              />
              {error && (
                <Typography variant="caption" color="error">
                  {error}
                </Typography>
              )}
              <Box>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Icon name="send" size={16} />}
                  disabled={!draft.trim() || answer.isPending}
                  onClick={() => answer.mutate({ id: newest.id, text: draft.trim() })}
                >
                  {t('doctor:orderDetail.clarification.send')}
                </Button>
              </Box>
            </Stack>
          )}
        </>
      ) : (
        <SectionCard
          icon="help"
          title={
            canAnswer
              ? t('doctor:orderDetail.clarification.title')
              : t('lab:orderSheet.clarification.answeredTitle')
          }
        >
          {answer.isSuccess && (
            <Callout tone="success" sx={{ mb: 1.75 }}>
              {t('doctor:orderDetail.clarification.sent')}
            </Callout>
          )}
          <Exchange row={newest} />
        </SectionCard>
      )}

      {older.length > 0 && (
        <Box>
          <ButtonBase
            onClick={() => setShowOlder((v) => !v)}
            sx={{
              gap: 0.5,
              borderRadius: 1,
              px: 0.5,
              py: 0.25,
              color: 'text.secondary',
              fontSize: '0.78125rem',
              fontWeight: 600,
            }}
          >
            <Icon name={showOlder ? 'expand_less' : 'expand_more'} size={16} />
            {t('common:clarification.previousQuestions', { n: older.length })}
          </ButtonBase>
          <Collapse in={showOlder} unmountOnExit>
            <Stack spacing={1.25} sx={{ mt: 1.25 }}>
              {older.map((r) => (
                <SectionCard key={r.id}>
                  <Exchange row={r} />
                </SectionCard>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Stack>
  );
}

/** One question-and-answer pair, read-only. */
function Exchange({ row }: { row: OrderClarificationRow }) {
  const { t } = useTranslation('common');
  return (
    <Stack spacing={1.75}>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {t('clarification.question')} · {t('clarification.askedOn', { date: fmt(row.asked_at) })}
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, mt: 0.25, whiteSpace: 'pre-wrap' }}>
          {row.question}
        </Typography>
      </Box>
      {row.answer && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t('clarification.answer')}
            {row.answered_at
              ? ` · ${t('clarification.answeredOn', { date: fmt(row.answered_at) })}`
              : ''}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', mt: 0.25, whiteSpace: 'pre-wrap' }}>
            {row.answer}
          </Typography>
        </Box>
      )}
    </Stack>
  );
}
