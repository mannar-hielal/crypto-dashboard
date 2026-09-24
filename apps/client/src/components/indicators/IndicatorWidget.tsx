import { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { Eye, EyeOff, Settings, X } from 'lucide-react';
import { getIndicatorMeta } from '@/lib/indicators/catalog';
import type { IndicatorInstance } from '@/lib/indicators/types';
import { bg, color, fontSize } from '@/lib/tokens';

interface IndicatorWidgetProps {
  instance: IndicatorInstance;
  latestValue: number | null;
  containerRect: DOMRect | null;
  onToggle: (instanceId: string) => void;
  onSettings: (instanceId: string, anchorRect: DOMRect) => void;
  onRemove: (instanceId: string) => void;
  onPositionChange: (instanceId: string, pos: { x: number; y: number }) => void;
}

const W = 180;
const H = 36;

export function IndicatorWidget({
  instance,
  latestValue,
  containerRect,
  onToggle,
  onSettings,
  onRemove,
  onPositionChange,
}: IndicatorWidgetProps) {
  const meta = getIndicatorMeta(instance.indicatorId);
  const [dragging, setDragging] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number; y: number } }) => {
      let x = instance.position.x + info.offset.x;
      let y = instance.position.y + info.offset.y;
      if (containerRect) {
        x = Math.max(0, Math.min(x, containerRect.width - W));
        y = Math.max(0, Math.min(y, containerRect.height - H));
      }
      onPositionChange(instance.instanceId, { x, y });
      dragX.set(0);
      dragY.set(0);
      setDragging(false);
    },
    [
      instance.instanceId,
      instance.position.x,
      instance.position.y,
      containerRect,
      onPositionChange,
      dragX,
      dragY,
    ]
  );

  const handleSettingsClick = useCallback(() => {
    const rect = settingsBtnRef.current?.getBoundingClientRect();
    if (rect) onSettings(instance.instanceId, rect);
  }, [instance.instanceId, onSettings]);

  const label = meta?.label ?? instance.indicatorId.toUpperCase();
  const paramSummary =
    instance.indicatorId === 'ema' || instance.indicatorId === 'sma'
      ? `${instance.params.length ?? ''}`
      : instance.indicatorId === 'macd'
        ? `${instance.params.fast ?? 12},${instance.params.slow ?? 26},${instance.params.signalLength ?? 9}`
        : '';

  return (
    <motion.div
      drag
      dragMomentum={false}
      onDragStart={() => {
        dragX.set(0);
        dragY.set(0);
        setDragging(true);
      }}
      onDragEnd={handleDragEnd}
      className="absolute z-20 cursor-grab overflow-hidden rounded-lg border border-white/8 text-sm backdrop-blur-md active:cursor-grabbing"
      style={{
        left: instance.position.x,
        top: instance.position.y,
        x: dragX,
        y: dragY,
        background: `${bg.page}e6`,
        opacity: instance.enabled ? 1 : 0.5,
        pointerEvents: 'auto',
      }}
    >
      <div className="flex items-center gap-1 px-2 py-1">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: instance.color }} />

        <span
          className="font-semibold whitespace-nowrap"
          style={{ fontSize: fontSize.xs10, color: color.white }}
        >
          {label}
          {paramSummary && <span style={{ color: color.muted }}> {paramSummary}</span>}
        </span>

        {!dragging && latestValue !== null && instance.enabled && (
          <span
            className="ml-1 font-mono tabular-nums"
            style={{ fontSize: fontSize.xs10, color: color.muted }}
          >
            {latestValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(instance.instanceId);
            }}
            className="rounded p-0.5 transition-colors hover:text-white"
            style={{ color: instance.enabled ? color.purple : color.muted }}
            title={instance.enabled ? 'Hide' : 'Show'}
          >
            {instance.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>

          {meta && meta.params.length > 0 && (
            <button
              ref={settingsBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                handleSettingsClick();
              }}
              className="rounded p-0.5 transition-colors hover:text-white"
              style={{ color: color.muted }}
              title="Settings"
            >
              <Settings className="h-3 w-3" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(instance.instanceId);
            }}
            className="rounded p-0.5 transition-colors hover:text-red-400"
            style={{ color: color.muted }}
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
