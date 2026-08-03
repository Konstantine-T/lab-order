import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Pager } from '@/components/design';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const DEFAULT_SIZES = [25, 50, 100];

/** Bottom-bar pagination for the orders card list. Keeps the page-size +
 *  page-number controls that the previous DataGrid had. */
export function OrdersPaginator({
  page,
  pageSize,
  total,
  pageSizeOptions = DEFAULT_SIZES,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const { t } = useTranslation('common');
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ sm: 'center' }}
      justifyContent="space-between"
      spacing={1.5}
      sx={{ mt: 0.5 }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {t('pagination.showing', { from, to, total })}
        </Typography>
        <TextField
          select
          size="small"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          sx={{ width: 96 }}
        >
          {pageSizeOptions.map((n) => (
            <MenuItem key={n} value={n}>
              {n}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Pager
        page={Math.min(page, pageCount) - 1}
        pageCount={pageCount}
        onChange={(p) => onPageChange(p + 1)}
      />
    </Stack>
  );
}
