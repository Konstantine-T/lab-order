import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { radii } from '@/theme/tokens';
import type { OrdersView } from './useOrdersView';

/**
 * List / grid, two icon buttons at the filter row's height. Renders nothing on
 * a phone (`canSwitch` false): there it is always the grid.
 */
export function OrdersViewToggle({
  view,
  onChange,
  canSwitch,
}: {
  view: OrdersView;
  onChange: (view: OrdersView) => void;
  canSwitch: boolean;
}) {
  const { t } = useTranslation('common');
  if (!canSwitch) return null;
  const item = (value: OrdersView, icon: string, label: string) => (
    <ToggleButton value={value} aria-label={label} title={label} sx={{ px: 1, py: 0.5 }}>
      <Icon name={icon} size={18} />
    </ToggleButton>
  );
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={view}
      // A click on the pressed button sends null: keep the current view.
      onChange={(_, next: OrdersView | null) => next && onChange(next)}
      sx={{
        flexShrink: 0,
        bgcolor: 'background.paper',
        '& .MuiToggleButton-root': {
          height: 34,
          borderColor: 'divider',
          color: 'text.secondary',
          '&.Mui-selected': { color: 'primary.main' },
        },
        '& .MuiToggleButtonGroup-firstButton': { borderRadius: `${radii.control}px 0 0 ${radii.control}px` },
        '& .MuiToggleButtonGroup-lastButton': { borderRadius: `0 ${radii.control}px ${radii.control}px 0` },
      }}
    >
      {item('list', 'view_list', t('ordersView.list'))}
      {item('grid', 'grid_view', t('ordersView.grid'))}
    </ToggleButtonGroup>
  );
}
