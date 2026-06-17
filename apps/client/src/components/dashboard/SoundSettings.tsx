import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { useTradingSoundCtx } from '@/hooks/TradingSoundContext';
import { bg, color, fontSize } from '@/lib/tokens';

const PREVIEWS = [
  { label: 'Market order placed', fn: 'playOrderPlaced', color: color.purpleDark } as const,
  { label: 'Pending order queued', fn: 'playOrderQueued', color: color.amber } as const,
  { label: 'Order filled', fn: 'playOrderFilled', color: color.purple } as const,
  { label: 'Closed with profit', fn: 'playProfit', color: color.green } as const,
  { label: 'Closed with loss', fn: 'playLoss', color: color.red } as const,
] as const;

export function SoundSettings() {
  const sound = useTradingSoundCtx();
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastAnchorRef = useRef<{ right: number; bottom: number } | null>(null);

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

  useEffect(() => {
    if (!open) return;

    const onReposition = () => schedulePositionUpdate();
    window.addEventListener('resize', onReposition);
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
          className="w-60 rounded-xl border p-4 shadow-2xl"
          style={{ background: bg.panel, borderColor: `${color.glow}20`, ...popoverStyle }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: color.white }}>
              Sound Alerts
            </span>
            <button
              onClick={sound.toggleMute}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold transition-colors"
              style={{
                background: sound.muted ? `${color.red}20` : `${color.green}20`,
                color: sound.muted ? color.red : color.green,
              }}
            >
              {sound.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              {sound.muted ? 'Muted' : 'On'}
            </button>
          </div>

          <div className="mb-3 space-y-1.5">
            <div className="flex justify-between" style={{ fontSize: fontSize.xs, color: color.muted }}>
              <span>Volume</span>
              <span>{Math.round(vol * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <VolumeX className="h-2.5 w-2.5 shrink-0" style={{ color: `${color.muted}60` }} />
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
                  background: `linear-gradient(to right, ${color.purpleDark} ${vol * 100}%, ${color.muted}15 ${vol * 100}%)`,
                }}
              />
              <Volume2 className="h-3 w-3 shrink-0" style={{ color: `${color.muted}60` }} />
            </div>
          </div>

          <div className="mb-3 border-t" style={{ borderColor: `${color.muted}15` }} />

          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: `${color.muted}60` }}>
            Preview
          </p>
          <div className="space-y-1">
            {PREVIEWS.map(({ label, fn, color: c }) => (
              <button
                key={fn}
                onClick={() => sound[fn]()}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors"
                style={{
                  border: '1px solid transparent',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${color.muted}15`;
                  e.currentTarget.style.background = `${color.muted}5`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span className="text-xs font-medium" style={{ color: c }}>
                  {label}
                </span>
                <span style={{ fontSize: fontSize.xs, color: `${color.muted}50` }}>▶</span>
              </button>
            ))}
          </div>

          <p className="mt-3 text-center" style={{ fontSize: fontSize.xs10, color: `${color.muted}40` }}>
            Plays on order &amp; position events
          </p>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        title="Sound alert settings"
        className="flex h-6 w-6 items-center justify-center rounded transition-colors"
        style={{ color: open ? color.white : `${color.muted}60` }}
      >
        {sound.muted || vol < 0.01 ? (
          <VolumeX className="h-3.5 w-3.5" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" />
        )}
      </button>

      {popover}
    </div>
  );
}
