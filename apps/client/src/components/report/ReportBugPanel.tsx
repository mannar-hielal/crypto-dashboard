import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Image as ImageIcon, Loader2, X, XCircle } from 'lucide-react';

import { guide } from '@/lib/guideAnchors';
import { describeReportContext, collectReportContext } from '@/lib/reportContext';
import { MAX_SCREENSHOTS, ScreenshotError, prepareScreenshot } from '@/lib/reportImages';
import { BugReportError, sendBugReport } from '@/lib/sendBugReport';
import { trapFocus } from '@/lib/trapFocus';
import { zIndex } from '@/lib/tokens';
import { useAuthStore } from '@/store/authStore';
import { useReportDraft } from '@/store/reportDraftStore';
import styles from './ReportBugPanel.module.css';

const MIN_DESCRIPTION = 10;
const MAX_DESCRIPTION = 4000;

/** What the reporter reads when a send fails, by what went wrong */
function sendFailure(err: unknown): string {
  if (err instanceof BugReportError) {
    if (err.status === 429)
      return 'You have sent a few reports already. Try again in a few minutes.';
    if (err.status === 413) return 'Those screenshots are too large. Remove one and try again.';
    // Two refusals share this status: an address not yet verified, and an account being deleted. The server's own words tell them apart.
    if (err.status === 403) {
      return /Verify/.test(err.message)
        ? 'Verify your email address first (check your inbox), then send the report.'
        : err.message;
    }
    if (err.status === 401) return 'Your session ended. Sign in again, then send the report.';
    // The server names the screenshot it refused, which the reporter can act on. Any other refusal is
    // a schema message ("body/context/viewport must NOT have..."): no use to read, so it is not shown.
    if (err.status === 400 && /^Screenshot \d/.test(err.message)) return err.message;
    if (err.status === 400)
      return 'The report was not accepted. Shorten it a little and try again.';
  }
  return 'Could not send the report. Check your connection and try again.';
}

interface ReportBugPanelProps {
  onClose: () => void;
}

/**
 * "Found a bug?" (owner 2026-11-25): the account's email (shown, not editable), a description and up to three screenshots, sent to the
 * team by e-mail. Signed-in users only (the trigger is not shown otherwise). A card under the top
 * bar on a wide screen, a sheet from the bottom on a phone. It sits over a lesson, a checkpoint and
 * the map (`zIndex.report`), and it keeps its keys to itself: Esc closes only this, never the lesson
 * under it. The page, the chart's symbol and the lesson go with the report, and the panel says so.
 */
export function ReportBugPanel({ onClose }: ReportBugPanelProps) {
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const userEmail = useAuthStore((s) => s.user?.email ?? '');

  const description = useReportDraft((s) => s.description);
  const screenshots = useReportDraft((s) => s.screenshots);

  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [preparing, setPreparing] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [pickError, setPickError] = useState('');
  // Read once, when the panel opens: what is on screen is what the report is about
  const context = useMemo(() => collectReportContext(), []);

  // The cursor goes to the description: the e-mail is the account's own and is only shown
  useEffect(() => {
    (descriptionField.current ?? panel.current)?.focus();
  }, []);

  // Esc closes this panel and nothing under it: caught before the lesson's, the checkpoint's or the map's own
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const descriptionOk = description.trim().length >= MIN_DESCRIPTION;
  const full = screenshots.length >= MAX_SCREENSHOTS;

  const pick = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setPickError('');
    setPreparing(true);
    const room = MAX_SCREENSHOTS - useReportDraft.getState().screenshots.length;
    const added = [];
    try {
      for (const file of [...files].slice(0, room)) added.push(await prepareScreenshot(file));
      if (files.length > room) setPickError(`Three screenshots at most.`);
    } catch (err) {
      setPickError(err instanceof ScreenshotError ? err.message : 'Could not use that image.');
    } finally {
      if (added.length > 0) {
        const draft = useReportDraft.getState();
        draft.setScreenshots([...draft.screenshots, ...added]);
      }
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  // A pasted image (Ctrl or Cmd + V, after a screenshot to the clipboard) is attached like a picked one,
  // with the same limits. Text on its own is left alone, and text that came with the image still pastes.
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (status !== 'idle' || !e.clipboardData) return;
    const data = e.clipboardData;
    const fromFiles = [...data.files];
    const files = fromFiles.length
      ? fromFiles
      : [...data.items].flatMap((item) => (item.kind === 'file' ? [item.getAsFile()] : []));
    const images = files.filter((f): f is File => f !== null && f.type.startsWith('image/'));
    if (images.length === 0) return;
    if (![...data.types].includes('text/plain')) e.preventDefault();
    void pick(images);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setError('');
    if (!descriptionOk) return descriptionField.current?.focus();
    setStatus('sending');
    try {
      await sendBugReport({
        description: description.trim(),
        context,
        screenshots,
      });
      useReportDraft.getState().reset();
      setStatus('sent');
    } catch (err) {
      setError(sendFailure(err));
      setStatus('idle');
    }
  };

  const sending = status === 'sending';

  return createPortal(
    <div
      className={styles.scrim}
      style={{ zIndex: zIndex.report }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onPaste={onPaste}
        // Its keys stay here: the lesson sheet under it traps Tab for itself, and React lets a key rise through a portal
        onKeyDown={(e) => {
          trapFocus(e, panel.current);
          e.stopPropagation();
        }}
        {...guide('report.panel')}
      >
        <header className={styles.head}>
          <h2 id={headingId} className={styles.title}>
            Found a bug?
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={onClose}
            {...guide('report.close')}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {status === 'sent' ? (
          <div className={styles.sent} role="status">
            <CheckCircle2 className={styles.sentIcon} size={40} aria-hidden="true" />
            <p className={styles.sentTitle}>Thanks, we got your report.</p>
            <p className={styles.sentText}>
              If we need more detail we will write to {userEmail || 'you'}.
            </p>
            <button type="button" className={styles.submit} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <p className={styles.lead}>Oh, let us know what&apos;s broken</p>

            <div className={styles.field}>
              {/* The account's own address, shown and not editable: the server uses the account's, not one typed here */}
              <input
                id={`${headingId}-email`}
                type="email"
                className={`${styles.input} ${styles.readOnly}`}
                aria-label="Your email address"
                aria-describedby={`${headingId}-email-note`}
                value={userEmail}
                readOnly
                {...guide('report.email')}
              />
              <p id={`${headingId}-email-note`} className={styles.fieldNote}>
                We will write to this address if we need more detail.
              </p>
            </div>

            <div className={styles.field}>
              <textarea
                ref={descriptionField}
                className={styles.textarea}
                placeholder="Description (Required)"
                aria-label="Description (required)"
                aria-invalid={tried && !descriptionOk}
                aria-describedby={tried && !descriptionOk ? `${headingId}-desc-err` : undefined}
                rows={5}
                maxLength={MAX_DESCRIPTION}
                value={description}
                onChange={(e) => useReportDraft.getState().setDescription(e.target.value)}
                {...guide('report.description')}
              />
              {tried && !descriptionOk && (
                <p id={`${headingId}-desc-err`} className={styles.fieldError}>
                  Tell us what happened, in at least {MIN_DESCRIPTION} characters.
                </p>
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => void pick(e.target.files)}
            />
            <button
              type="button"
              className={styles.shot}
              disabled={full || preparing || sending}
              onClick={() => fileInput.current?.click()}
              {...guide('report.screenshot')}
            >
              {preparing ? (
                <Loader2 size={16} className={styles.spin} aria-hidden="true" />
              ) : (
                <ImageIcon size={16} aria-hidden="true" />
              )}
              {preparing ? 'Preparing…' : 'Screenshot'}
            </button>
            {screenshots.length > 0 && (
              <div className={styles.chip}>
                <ImageIcon size={16} aria-hidden="true" />
                <span className={styles.chipLabel}>Screenshot</span>
                <span className={styles.count}>{screenshots.length}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${screenshots.length === 1 ? 'the screenshot' : 'all screenshots'}`}
                  onClick={() => useReportDraft.getState().setScreenshots([])}
                >
                  <XCircle size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            {screenshots.length === 0 && !preparing && (
              <p className={styles.hint}>
                Or paste an image: Ctrl + V, or ⌘ V on a Mac. A screenshot shows whatever is on your
                screen, so hide anything private first.
              </p>
            )}
            {pickError && (
              <p role="alert" className={styles.fieldError}>
                {pickError}
              </p>
            )}

            <p className={styles.context}>{describeReportContext(context)}</p>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}

            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.submit}
                disabled={sending || preparing}
                {...guide('report.submit')}
              >
                {sending ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
