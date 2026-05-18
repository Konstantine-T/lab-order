import { Box, Card, CardActionArea, CardContent, Grid, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { templateName, templateDescription } from './templateLabels';
import type { PlatformFormTemplateRow } from '@/types/database';

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
        .not('code', 'in', '(TEMPORARY_CROWN,ZIRCONIA_ON_IMPLANT,TEMPORARY_ON_IMPLANT,MOCKUP_WAXUP,REMOVABLE_PROSTHESIS,OTHER_CUSTOM)')
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

  return (
    <Grid container spacing={2}>
      {templates.map((tpl) => {
        const isSelected = tpl.id === selectedTemplateId;
        const localizedName = templateName(t, tpl.code, tpl.name);
        const localizedDescription = templateDescription(t, tpl.code, tpl.description);
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
                    <Typography variant="subtitle1" fontWeight={600}>
                      {localizedName}
                    </Typography>
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
  );
}
