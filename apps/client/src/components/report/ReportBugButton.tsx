import { useCallback, useEffect, useRef, useState } from 'react';
import { Bug } from 'lucide-react';

import { guide, type GuideAnchor } from '@/lib/guideAnchors';
import { color } from '@/lib/tokens';
import { useAuthStore } from '@/store/authStore';
import { useReportDraft } from '@/store/reportDraftStore';
import { ReportBugPanel } from './ReportBugPanel';
import styles from './ReportBugButton.module.css';

interface ReportBugButtonProps {
  /** `bar`: the top bar's icon. `sheet`: the small one in a lesson, checkpoint or map header. */
  variant: 'bar' | 'sheet';
  anchor: GuideAnchor;
}

/**
 * The way in to "Found a bug?" (owner 2026-11-25): an icon in the top bar, and the same in the header
 * of a lesson, a checkpoint and the learning map, which cover the top bar while they are open.
 * Signed-in users only: it is not drawn for a guest. Focus goes back to it when the panel closes.
 */
export function ReportBugButton({ variant, anchor }: ReportBugButtonProps) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Signing out takes the icon away (the top bar draws it for a signed-in user only): a draft left behind
  // is wiped then, not kept in memory for whoever signs in next
  useEffect(
    () => () => {
      if (useAuthStore.getState().user === null) useReportDraft.getState().reset();
    },
    []
  );
  const close = useCallback(() => {
    setOpen(false);
    // After the panel is gone, so the focus does not land on something that is about to unmount
    requestAnimationFrame(() => button.current?.focus());
  }, []);

  if (userId === null) return null;

  return (
    <>
      <button
        ref={button}
        type="button"
        className={variant === 'bar' ? styles.bar : styles.sheet}
        style={variant === 'bar' ? { color: open ? color.white : color.muted } : undefined}
        aria-label="Report a bug"
        title="Report a bug"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          // Opening takes the draft over: another account's is thrown away first
          if (!open) useReportDraft.getState().claim(userId);
          setOpen((o) => !o);
        }}
        {...guide(anchor)}
      >
        <Bug size={variant === 'bar' ? 18 : 16} aria-hidden="true" />
      </button>
      {open && <ReportBugPanel onClose={close} />}
    </>
  );
}
