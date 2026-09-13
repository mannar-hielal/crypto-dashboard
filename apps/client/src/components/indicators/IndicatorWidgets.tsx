import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import type {
  IndicatorInstance,
  IndicatorPrimitive,
  IndicatorStyle,
  ParamValues,
} from '@/lib/indicators/types';
import { IndicatorWidget } from './IndicatorWidget';
import { IndicatorSettings } from './IndicatorSettings';

interface IndicatorWidgetsProps {
  indicators: IndicatorInstance[];
  containerRef: RefObject<HTMLDivElement | null>;
  primitiveRefs: RefObject<Map<string, IndicatorPrimitive>>;
  onRemove: (instanceId: string) => void;
  onUpdate: (instanceId: string, patch: Partial<IndicatorInstance>) => void;
  onPositionChange: (instanceId: string, position: { x: number; y: number }) => void;
}

export function IndicatorWidgets({
  indicators,
  containerRef,
  primitiveRefs,
  onRemove,
  onUpdate,
  onPositionChange,
}: IndicatorWidgetsProps) {
  const [settingsTarget, setSettingsTarget] = useState<{
    instanceId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [, forceRender] = useState(0);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerRect(el.getBoundingClientRect());
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Refresh latest values every second while indicators are visible
  useEffect(() => {
    const interval = setInterval(() => forceRender((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  function getPrimitive(instanceId: string): IndicatorPrimitive | undefined {
    return primitiveRefs.current.get(instanceId);
  }

  function getLatestValue(instance: IndicatorInstance): number | null {
    const prim = getPrimitive(instance.instanceId);
    if (!prim || !instance.enabled) return null;
    try {
      const series = prim.getSeries();
      const s = Array.isArray(series) ? series[0] : series;
      if (!s) return null;
      const lastData = s.data();
      if (lastData.length === 0) return null;
      const last = lastData[lastData.length - 1];
      return (last as { value?: number }).value ?? null;
    } catch {
      return null;
    }
  }

  function handleSettings(instanceId: string, anchorRect: DOMRect) {
    setSettingsTarget({ instanceId, anchorRect });
  }

  function handleSettingsSave(
    instanceId: string,
    params: ParamValues,
    color: string,
    lineWidth: 1 | 2 | 3 | 4,
    lineStyle: IndicatorStyle['lineStyle']
  ) {
    const prim = getPrimitive(instanceId);
    if (prim) {
      prim.applyOptions(params);
      prim.applyStyle({ color, lineWidth, lineStyle });
    }
    onUpdate(instanceId, { params, color, lineWidth, lineStyle });
  }

  function handleCloseSettings() {
    setSettingsTarget(null);
  }

  function handleToggle(instanceId: string) {
    const inst = indicators.find((i) => i.instanceId === instanceId);
    if (inst) onUpdate(instanceId, { enabled: !inst.enabled });
  }

  const enabled = indicators.filter((inst) => inst.enabled);

  if (enabled.length === 0 && !settingsTarget) return null;

  const settingsInstance = settingsTarget
    ? indicators.find((inst) => inst.instanceId === settingsTarget.instanceId)
    : null;

  return (
    <>
      {indicators.map((inst) => (
        <IndicatorWidget
          key={inst.instanceId}
          instance={inst}
          latestValue={getLatestValue(inst)}
          containerRect={containerRect}
          onToggle={handleToggle}
          onSettings={handleSettings}
          onRemove={onRemove}
          onPositionChange={onPositionChange}
        />
      ))}

      {settingsInstance && settingsTarget && (
        <IndicatorSettings
          instance={settingsInstance}
          anchorRect={settingsTarget.anchorRect}
          onSave={handleSettingsSave}
          onClose={handleCloseSettings}
        />
      )}
    </>
  );
}
