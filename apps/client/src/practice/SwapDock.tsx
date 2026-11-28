/**
 * Where the practice swap sits on the dashboard (owner's visual Q&A 2026-11-28): in the order form's
 * place while one of its guide chapters runs, full screen on a phone and a right-hand sheet on a
 * tablet. Closing it ends the guide.
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { sidePanel } from '@/lib/tokens';
import { useTourStore } from '@/guide/tourStore';
import { useOrderPrefillStore } from '@/store/orderPrefillStore';
import { isSwapTour } from '@/guide/tours';
import { leaveSwapGuide } from './leaveSwapGuide';
import { SwapPanel } from './SwapPanel';
import styles from './SwapPanel.module.css';

const closeGuide = () => useTourStore.getState().close();

export function SwapDock({ narrow }: { narrow: boolean }) {
  const open = useTourStore((s) => isSwapTour(s.activeId));
  // An order prefill (Assets → Sell) is a wish to trade: it can't happen behind the panel
  useEffect(
    () =>
      useOrderPrefillStore.subscribe((s, prev) => {
        if (s.seq !== prev.seq) leaveSwapGuide();
      }),
    []
  );
  if (!open) return null;
  return (
    <motion.div
      initial={narrow ? { x: '100%', opacity: 0 } : { width: 0, opacity: 0 }}
      animate={narrow ? { x: 0, opacity: 1 } : { width: sidePanel.width, opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={narrow ? `${styles.dock} ${styles.dockOver}` : styles.dock}
    >
      <SwapPanel onClose={closeGuide} />
    </motion.div>
  );
}
