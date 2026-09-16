import { useState } from 'react';
import { Box, Collapse, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { motion, radii } from '@/theme/tokens';
import { useLandingTones } from './helpers';

type Item = { q: string; a: string };

/**
 * The design's accordion: one question open at a time, the first open on
 * arrival, and a click on the open one closes it (its `faqAllOpen` prop is
 * off by default and is not carried over).
 */
export function Faq() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const items = t('faq.items', { returnObjects: true }) as Item[];
  const [open, setOpen] = useState(0);

  return (
    <Stack spacing={1.25}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <Box
            key={item.q}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: `${radii.tile}px`,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            <Stack
              component="button"
              type="button"
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={2}
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              sx={{
                width: '100%',
                p: '18px 20px',
                border: 0,
                bgcolor: 'transparent',
                color: 'text.primary',
                font: 'inherit',
                fontSize: '0.96875rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer',
                transition: `background-color ${motion.fast}`,
                '&:hover': { bgcolor: tones.subtle },
              }}
            >
              <span>{item.q}</span>
              <Icon
                name="expand_more"
                size={20}
                sx={{
                  color: tones.muted,
                  transition: `transform ${motion.slow}`,
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                }}
              />
            </Stack>
            <Collapse in={isOpen} unmountOnExit>
              <Typography
                sx={{ p: '0 20px 20px', fontSize: '0.9375rem', lineHeight: 1.7, color: 'text.secondary' }}
              >
                {item.a}
              </Typography>
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );
}
