import { useState } from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { motion } from '@/theme/tokens';
import { listOf, useLandingTones } from './helpers';

type Item = { q: string; a: string };

/**
 * The design's accordion: hairlines between the questions rather than boxed
 * cards, the first one open on arrival, one open at a time, and a click on
 * the open one closes it. Closed answers stay in the DOM (only collapsed), so
 * the text is there for search engines and find-in-page.
 */
export function Faq() {
  const { t } = useTranslation('landing');
  const tones = useLandingTones();
  const items = listOf<Item>(t('faq.items', { returnObjects: true }));
  const [open, setOpen] = useState(0);

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', minWidth: 0 }}>
      {items.map((item, i) => {
        const isOpen = open === i;
        const id = `faq-${i}`;
        return (
          <Box key={item.q} sx={{ borderTop: 1, borderColor: 'divider' }}>
            <Typography component="h3" sx={{ m: 0 }}>
              <Box
                component="button"
                type="button"
                id={`${id}-q`}
                aria-expanded={isOpen}
                aria-controls={`${id}-a`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: { xs: '16px', sm: '24px' },
                  py: { xs: '16px', sm: '20px' },
                  px: 0,
                  border: 0,
                  bgcolor: 'transparent',
                  color: 'text.primary',
                  font: 'inherit',
                  fontSize: { xs: '0.9375rem', sm: '1.0625rem' },
                  fontWeight: 600,
                  lineHeight: 1.35,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  '&:focus-visible': { outline: `2px solid ${tones.accent}`, outlineOffset: '3px' },
                }}
              >
                <span>{item.q}</span>
                <Icon
                  name="expand_more"
                  size={20}
                  sx={{
                    color: 'text.secondary',
                    transition: `transform ${motion.slow}`,
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                  }}
                />
              </Box>
            </Typography>
            <Collapse in={isOpen}>
              <Typography
                id={`${id}-a`}
                role="region"
                aria-labelledby={`${id}-q`}
                sx={{
                  pb: { xs: '16px', sm: '20px' },
                  maxWidth: 640,
                  fontSize: { xs: '0.875rem', sm: '0.9375rem' },
                  lineHeight: 1.6,
                  color: 'text.secondary',
                }}
              >
                {item.a}
              </Typography>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}
