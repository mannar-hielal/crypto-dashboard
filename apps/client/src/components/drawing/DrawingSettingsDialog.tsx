/**
 * TradingView's drawing settings (the floating toolbar's gear, "Settings…" on right-click): Style,
 * Text and Coordinates tabs, showing only what the tool supports — a Long / Short Position has
 * Inputs and Style instead (PositionSettings). The edits go to a draft and apply on OK, as one undo
 * step; Cancel or Esc drops them.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DataPoint, Drawing, DrawingStyle, LevelDef } from 'lightweight-charts-drawing';

type LineStyle = DrawingStyle['lineStyle'];
import { FONT_SIZES, capabilitiesOf } from '@/lib/drawingCapabilities';
import { MAX_DRAWING_TEXT } from '@/lib/drawingActions';
import { guide } from '@/lib/guideAnchors';
import { PositionColors, PositionInfo, PositionInputs } from './PositionSettings';
import { ColorField, NumberField } from './SettingsFields';
import styles from './DrawingSettingsDialog.module.css';

type Tab = 'inputs' | 'style' | 'text' | 'coordinates';

const LINE_WIDTHS = [1, 2, 3, 4] as const;
const LINE_STYLES: readonly LineStyle[] = ['solid', 'dashed', 'dotted'];

function formatTime(time: DataPoint['time']): string {
  const seconds = typeof time === 'number' ? time : Number(time);
  if (!Number.isFinite(seconds)) return String(time);
  return new Date(seconds * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

interface DrawingSettingsDialogProps {
  drawing: Drawing;
  /** A label for the tool, e.g. "Trend Line" */
  title: string;
  /** The chart's price step: a position's ticks count it, as its labels do */
  pip: number;
  onApply: (next: Drawing) => void;
  onClose: () => void;
}

export function DrawingSettingsDialog({
  drawing,
  title,
  pip,
  onApply,
  onClose,
}: DrawingSettingsDialogProps) {
  const caps = capabilitiesOf(drawing.kind);
  const [draft, setDraft] = useState<Drawing>(drawing);
  const [tab, setTab] = useState<Tab>(caps.position ? 'inputs' : 'style');
  const dialogRef = useRef<HTMLDivElement>(null);
  const s = draft.style;

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, []);

  function setStyle(patch: Partial<DrawingStyle>) {
    setDraft((d) => ({ ...d, style: { ...d.style, ...patch } }) as Drawing);
  }

  function setLevel(i: number, patch: Partial<LevelDef>) {
    const levels = (s.levels ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l));
    setStyle({ levels });
  }

  function setPointPrice(i: number, price: number) {
    setDraft(
      (d) => ({ ...d, points: d.points.map((p, j) => (j === i ? { ...p, price } : p)) }) as Drawing
    );
  }

  /** A position's entry: both its points sit at it (the second only sets where the box ends) */
  function setEntry(price: number) {
    setDraft((d) => ({ ...d, points: d.points.map((p) => ({ ...p, price })) }) as Drawing);
  }

  // A position's entry is in its Inputs, so it has no Coordinates (TradingView)
  const tabs: { id: Tab; label: string }[] = caps.position
    ? [
        { id: 'inputs', label: 'Inputs' },
        { id: 'style', label: 'Style' },
      ]
    : [
        { id: 'style', label: 'Style' },
        ...(caps.text ? [{ id: 'text' as const, label: 'Text' }] : []),
        ...(!draft.anchored ? [{ id: 'coordinates' as const, label: 'Coordinates' }] : []),
      ];
  const textColorValue = (caps.textColorKey === 'textColor' ? s.textColor : s.color) ?? s.color;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      // Focus stays in the dialog
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, textarea, [tabindex="0"]'
        ) ?? []
      );
      const first = focusables[0];
      const last = focusables.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawing-settings-title"
        className={styles.dialog}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        {...guide('drawing.settings')}
      >
        <h2 id="drawing-settings-title" className={styles.title}>
          {title}
        </h2>
        <div role="tablist" aria-label="Settings" className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`drawing-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`drawing-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={styles.tab}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`drawing-panel-${tab}`}
          aria-labelledby={`drawing-tab-${tab}`}
          className={`${styles.panel}${caps.position ? ` ${styles.position}` : ''}`}
        >
          {tab === 'inputs' && (
            <PositionInputs draft={draft} pip={pip} setStyle={setStyle} setEntry={setEntry} />
          )}

          {tab === 'style' && (
            <>
              {caps.line && (
                <div className={styles.row}>
                  <span className={styles.label}>Line</span>
                  <ColorField
                    label="Line colour"
                    value={s.color}
                    onChange={(color) => setStyle({ color })}
                  />
                  <select
                    aria-label="Line width"
                    className={styles.select}
                    value={s.width}
                    onChange={(e) => setStyle({ width: Number(e.target.value) })}
                  >
                    {LINE_WIDTHS.map((w) => (
                      <option key={w} value={w}>
                        {w}px
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Line style"
                    className={styles.select}
                    value={s.lineStyle}
                    onChange={(e) => setStyle({ lineStyle: e.target.value as LineStyle })}
                  >
                    {LINE_STYLES.map((ls) => (
                      <option key={ls} value={ls}>
                        {ls[0]!.toUpperCase() + ls.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {caps.position && <PositionColors style={s} setStyle={setStyle} />}
              {caps.extend && (
                <div className={styles.row}>
                  <span className={styles.label}>Extend</span>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={!!s.extendLeft}
                      onChange={(e) => setStyle({ extendLeft: e.target.checked })}
                    />
                    Left
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={!!s.extendRight}
                      onChange={(e) => setStyle({ extendRight: e.target.checked })}
                    />
                    Right
                  </label>
                </div>
              )}
              {caps.priceLabels && (
                <div className={styles.row}>
                  <span className={styles.label}>Labels</span>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={!!s.showPriceLabels}
                      onChange={(e) => setStyle({ showPriceLabels: e.target.checked })}
                    />
                    Price labels
                  </label>
                </div>
              )}
              {caps.position && <PositionInfo style={s} setStyle={setStyle} />}
              {(caps.fill || caps.levels) && (
                <div className={styles.row}>
                  <span className={styles.label}>Background</span>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={s.fillBackground !== false}
                      onChange={(e) => setStyle({ fillBackground: e.target.checked })}
                    />
                    Fill
                  </label>
                  {caps.fill && (
                    <ColorField
                      label="Fill colour"
                      value={s.backgroundColor ?? s.color}
                      opacity={100 - (s.transparency ?? 80)}
                      onChange={(backgroundColor) => setStyle({ backgroundColor })}
                      onOpacityChange={(o) => setStyle({ transparency: 100 - o })}
                    />
                  )}
                </div>
              )}
              {caps.levels && (
                <fieldset className={styles.levels}>
                  <legend className={styles.label}>Levels</legend>
                  {(s.levels ?? []).map((level, i) => (
                    // Levels have no id: their place in the ladder is their identity (the ladder's
                    // length never changes here), so typing in a value keeps its field
                    <div key={`level-${i}`} className={styles.level}>
                      <input
                        type="checkbox"
                        aria-label={`Level ${level.coeff} shown`}
                        checked={level.visible}
                        onChange={(e) => setLevel(i, { visible: e.target.checked })}
                      />
                      <NumberField
                        label={`Level ${i + 1} value`}
                        value={level.coeff}
                        onChange={(coeff) => setLevel(i, { coeff })}
                      />
                      <ColorField
                        label={`Level ${level.coeff} colour`}
                        value={level.color}
                        onChange={(color) => setLevel(i, { color })}
                      />
                    </div>
                  ))}
                </fieldset>
              )}
            </>
          )}

          {tab === 'text' && (
            <>
              <textarea
                aria-label="Text"
                className={styles.textarea}
                maxLength={MAX_DRAWING_TEXT}
                value={draft.text ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }) as Drawing)}
              />
              <div className={styles.row}>
                <ColorField
                  label="Text colour"
                  value={textColorValue}
                  onChange={(c) => setStyle({ [caps.textColorKey]: c })}
                />
                <select
                  aria-label="Font size"
                  className={styles.select}
                  value={s.fontSize ?? 14}
                  onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}
                >
                  {FONT_SIZES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={!!s.bold}
                    onChange={(e) => setStyle({ bold: e.target.checked })}
                  />
                  Bold
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={!!s.italic}
                    onChange={(e) => setStyle({ italic: e.target.checked })}
                  />
                  Italic
                </label>
              </div>
            </>
          )}

          {tab === 'coordinates' &&
            draft.points.map((p, i) => (
              // Points have no id: their order is their identity (fixed for a drawing)
              <div key={`point-${i}`} className={styles.row}>
                <span className={styles.label}>#{i + 1}</span>
                <NumberField
                  label={`Point ${i + 1} price`}
                  value={p.price}
                  onChange={(v) => setPointPrice(i, v)}
                />
                <span className={styles.time}>{formatTime(p.time)}</span>
              </div>
            ))}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.ok}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Ok
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
