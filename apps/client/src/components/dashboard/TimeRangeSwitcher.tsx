import { TIME_RANGE_PRESETS, type TimeRangePreset } from '@/lib/markets';
import styles from './TimeRangeSwitcher.module.css';

interface TimeRangeSwitcherProps {
  activePreset: TimeRangePreset | null;
  onPresetChange: (preset: TimeRangePreset | null) => void;
}

export function TimeRangeSwitcher({ activePreset, onPresetChange }: TimeRangeSwitcherProps) {
  return (
    <div className={styles.root}>
      {TIME_RANGE_PRESETS.map((p) => {
        const isActive = activePreset === p.key;
        return (
          <button
            key={p.key}
            type="button"
            className={styles.btn}
            onClick={() => onPresetChange(isActive ? null : p.key)}
            title={p.title}
          >
            {isActive && <span className={styles.activeBg} />}
            <span className={isActive ? styles.activeLabel : undefined}>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
