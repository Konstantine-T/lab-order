import { useTranslation } from 'react-i18next';
import { ChoicePill, Icon } from '@/components/design';

/**
 * "More filters", the button that opens a list's secondary filters.
 *
 * It says when something it hides is set: with `activeCount` above 0 it is
 * filled brand and reads "More filters · 2", its accessible name says how many
 * are active, and clearing them returns it to the outlined look. Open or
 * closed is the chevron (and `aria-expanded`), not the fill, so a set filter
 * stays visible with the panel collapsed.
 */
export function MoreFiltersButton({
  open,
  onToggle,
  activeCount,
}: {
  open: boolean;
  onToggle: () => void;
  /** How many of the filters behind it differ from their defaults. */
  activeCount: number;
}) {
  const { t } = useTranslation('common');
  const active = activeCount > 0;
  return (
    <ChoicePill
      selected={active}
      onClick={onToggle}
      ariaExpanded={open}
      ariaLabel={active ? t('moreFilters.ariaActive', { count: activeCount }) : t('moreFilters.label')}
      sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
    >
      <Icon name="tune" size={15} />
      {active ? t('moreFilters.withCount', { count: activeCount }) : t('moreFilters.label')}
      <Icon name={open ? 'expand_less' : 'expand_more'} size={16} sx={{ ml: -0.25 }} />
    </ChoicePill>
  );
}
