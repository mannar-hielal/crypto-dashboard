/**
 * SoundSettings
 *
 * A compact popover button for the PaperTradingPanel header that lets the
 * user control the trading sound alert volume and preview each sound.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { useTradingSoundCtx } from '@/hooks/TradingSoundContext';

// ─── Preview rows ─────────────────────────────────────────────────────────────

const PREVIEWS = [
  { label: 'Market order placed', fn: 'playOrderPlaced', color: '#60a5fa' } as const,
  { label: 'Pending order queued', fn: 'playOrderQueued', color: '#fbbf24' } as const,
  { label: 'Order filled', fn: 'playOrderFilled', color: '#a78bfa' } as const,
  { label: 'Closed with profit', fn: 'playProfit', color: '#34d399' } as const,
  { label: 'Closed with loss', fn: 'playLoss', color: '#f87171' } as const,
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function SoundSettings() {
  const sound = useTradingSoundCtx();
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastAnchorRef = useRef<{ right: number; bottom: number } | null>(null);

  // Position popover above the trigger button using fixed coords so it escapes overflow:hidden parents
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const nextAnchor = {
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.top + 8,
    };
    const prevAnchor = lastAnchorRef.current;
    if (
      prevAnchor &&
      Math.abs(prevAnchor.right - nextAnchor.right) < 0.5 &&
      Math.abs(prevAnchor.bottom - nextAnchor.bottom) < 0.5
    ) {
      return;
    }
    lastAnchorRef.current = nextAnchor;
    setPopoverStyle({
      position: 'fixed',
      right: nextAnchor.right,
      bottom: nextAnchor.bottom,
      zIndex: 9999,
    });
  }, []);

  const schedulePositionUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  const handleOpen = () => {
    updatePosition();
    setOpen((o) => !o);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Re-anchor the portal popover while open as viewport/layout changes.
  useEffect(() => {
    if (!open) return;

    const onReposition = () => schedulePositionUpdate();
    window.addEventListener('resize', onReposition);
    // Capture scroll events from nested scroll containers too.
    window.addEventListener('scroll', onReposition, true);

    const triggerEl = triggerRef.current;
    const observer =
      triggerEl && 'ResizeObserver' in window
        ? new ResizeObserver(() => schedulePositionUpdate())
        : null;
    if (triggerEl && observer) observer.observe(triggerEl);

    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      observer?.disconnect();
    };
  }, [open, schedulePositionUpdate]);

  const vol = sound.volume;

  const popover = open
    ? createPortal(
        <div
          ref={panelRef}
          className="w-60 rounded-xl border border-white/10 p-4 shadow-2xl"
          style={{ background: '#1a1d2e', ...popoverStyle }}
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">
              Sound Alerts
            </span>
            <button
              onClick={sound.toggleMute}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold transition-colors"
              style={{
                background: sound.muted ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)',
                color: sound.muted ? '#f87171' : '#34d399',
              }}
            >
              {sound.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              {sound.muted ? 'Muted' : 'On'}
            </button>
          </div>

          {/* Volume slider */}
          <div className="mb-3 space-y-1.5">
            <div
              className="flex justify-between"
              style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}
            >
              <span>Volume</span>
              <span>{Math.round(vol * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <VolumeX
                className="h-2.5 w-2.5 shrink-0"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={vol}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  sound.setVolume(v);
                }}
                className="sound-vol-slider w-full cursor-pointer appearance-none rounded-full"
                style={{
                  height: 6,
                  background: `linear-gradient(to right, #7c3aed ${vol * 100}%, rgba(255,255,255,0.12) ${vol * 100}%)`,
                }}
              />
              <Volume2 className="h-3 w-3 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>
          </div>

          {/* Divider */}
          <div className="mb-3 border-t border-white/5" />

          {/* Preview sounds */}
          <p
            className="mb-2"
            style={{
              fontSize: '10px',
              color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Preview
          </p>
          <div className="space-y-1">
            {PREVIEWS.map(({ label, fn, color }) => (
              <button
                key={fn}
                onClick={() => sound[fn]()}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/5"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
              >
                <span className="text-xs font-medium" style={{ color }}>
                  {label}
                </span>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>▶</span>
              </button>
            ))}
          </div>

          <p
            className="mt-3 text-center"
            style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}
          >
            Plays on order &amp; position events
          </p>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      {/* ── Trigger button ──────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        onClick={handleOpen}
        title="Sound alert settings"
        className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
          open ? 'text-white/80' : 'hover:text-white/70'
        }`}
        style={{ color: open ? undefined : 'rgba(255,255,255,0.35)' }}
      >
        {sound.muted || vol < 0.01 ? (
          <VolumeX className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>

      {/* ── Popover rendered via portal so it escapes overflow:hidden parents ── */}
      {popover}
    </div>
  );
}
