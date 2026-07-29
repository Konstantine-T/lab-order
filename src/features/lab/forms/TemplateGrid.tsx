import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { templateName, templateDescription, templateHelp } from './templateLabels';
import { HelpTip } from '@/components/HelpTip';
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
          startIcon={<DesignServicesIcon />}
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
              <Card
                variant="outlined"
                sx={{
                  height: '100%',
                  borderColor: isSelected ? 'primary.main' : undefined,
                  borderWidth: isSelected ? 2 : 1,
                  position: 'relative',
                }}
              >
                <CardActionArea
                  onClick={() => onSelect(tpl.id)}
                  disabled={disabled}
                  sx={{ height: '100%', alignItems: 'flex-start' }}
                >
                  <CardContent sx={{ height: '100%' }}>
                    {isSelected && (
                      <CheckCircleIcon
                        color="primary"
                        sx={{ position: 'absolute', top: 8, right: 8, fontSize: 22 }}
                      />
                    )}
                    <Stack spacing={1.5}>
                      <DescriptionIcon
                        color={isSelected ? 'primary' : 'action'}
                        sx={{ fontSize: 32 }}
                      />
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {localizedName}
                        </Typography>
                        <HelpTip text={help} />
                      </Stack>
                      {localizedDescription && (
                        <Typography variant="body2" color="text.secondary">
                          {localizedDescription}
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}
