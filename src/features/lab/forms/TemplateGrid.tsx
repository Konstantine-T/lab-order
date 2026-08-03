import { alpha, Box, Button, Divider, Grid, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { templateName, templateDescription, templateHelp } from './templateLabels';
import { HelpTip } from '@/components/HelpTip';
import { Icon } from '@/components/design';
import { templateLook as look } from '@/utils/serviceDefaults';
import { lift, motion } from '@/theme/tokens';
import type { PlatformFormTemplateRow } from '@/types/database';

const CUSTOM_CODE = 'OTHER_CUSTOM';

type Props = {
  selectedTemplateId: string | null;
  onSelect: (templateId: string) => void;
  disabled?: boolean;
};

export function TemplateGrid({ selectedTemplateId, onSelect, disabled }: Props) {
  const { t } = useTranslation('common');
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['platform-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_form_templates')
        .select('*')
        .not('code', 'in', '(ZIRCONIA_ON_IMPLANT,TEMPORARY_ON_IMPLANT,MOCKUP_WAXUP,REMOVABLE_PROSTHESIS)')
        .order('name');
      if (error) throw error;
      return data as PlatformFormTemplateRow[];
    },
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
        {t('actions.loading')}
      </Box>
    );
  }

  // Custom Form is "build your own", conceptually distinct from picking a ready
  // template — surface it as a button above the template cards, not a card.
  const customTpl = templates.find((tpl) => tpl.code === CUSTOM_CODE);
  const cardTemplates = templates.filter((tpl) => tpl.code !== CUSTOM_CODE);

  return (
    <Stack spacing={2.5}>
      {customTpl && (
        <Button
          variant={customTpl.id === selectedTemplateId ? 'contained' : 'outlined'}
          onClick={() => onSelect(customTpl.id)}
          disabled={disabled}
          startIcon={<Icon name="stylus_note" size={18} />}
          sx={{
            alignSelf: 'flex-start',
            textTransform: 'none',
            textAlign: 'left',
            py: 1.25,
            px: 2.5,
            borderWidth: customTpl.id === selectedTemplateId ? 2 : 1,
          }}
        >
          <Stack alignItems="flex-start">
            <Typography fontWeight={600} lineHeight={1.2}>
              {templateName(t, customTpl.code, customTpl.name)}
            </Typography>
            {templateDescription(t, customTpl.code, customTpl.description) && (
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {templateDescription(t, customTpl.code, customTpl.description)}
              </Typography>
            )}
          </Stack>
        </Button>
      )}

      {customTpl && cardTemplates.length > 0 && (
        <Divider>
          <Typography variant="caption" color="text.secondary">
            {t('templatePicker.orStartFromTemplate')}
          </Typography>
        </Divider>
      )}

      <Grid container spacing={2}>
        {cardTemplates.map((tpl) => {
          const isSelected = tpl.id === selectedTemplateId;
          const localizedName = templateName(t, tpl.code, tpl.name);
          const localizedDescription = templateDescription(t, tpl.code, tpl.description);
          const help = templateHelp(t, tpl.code);
          return (
            <Grid key={tpl.id} item xs={12} sm={6} md={4} lg={3}>
              {/* The mockups' template tile: a tinted icon square over the
                  template's name, with the picked one outlined in brand. */}
              <Stack
                role="button"
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && onSelect(tpl.id)}
                onKeyDown={(e) => {
                  if (!disabled && e.key === 'Enter') onSelect(tpl.id);
                }}
                spacing={1.5}
                sx={{
                  position: 'relative',
                  height: '100%',
                  p: 2,
                  borderRadius: '16px',
                  border: isSelected ? 2 : 1,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: 'background.paper',
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  transition: `all ${motion.slow}`,
                  '&:hover': disabled
                    ? {}
                    : { borderColor: alpha(look(tpl.code).color, 0.6), boxShadow: lift.cardStrong },
                }}
              >
                {isSelected && (
                  <Icon
                    name="check_circle"
                    size={20}
                    filled
                    sx={{ position: 'absolute', top: 10, right: 10, color: 'primary.main' }}
                  />
                )}
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '12px',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: alpha(look(tpl.code).color, 0.12),
                  }}
                >
                  <Icon name={look(tpl.code).icon} size={21} sx={{ color: look(tpl.code).color }} />
                </Box>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>
                    {localizedName}
                  </Typography>
                  <HelpTip text={help} />
                </Stack>
                {localizedDescription && (
                  <Typography variant="body1" color="text.secondary">
                    {localizedDescription}
                  </Typography>
                )}
              </Stack>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}
