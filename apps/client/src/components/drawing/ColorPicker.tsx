// ─── ColorPicker — TradingView-style color swatch grid ────────────

import { useEffect, useRef } from 'react';
import { bg } from '@/lib/tokens';

interface ColorPickerProps {
  selectedColor?: string;
  onSelect: (hex: string) => void;
  onClose: () => void;
}

const GRAYS = [
  '#ffffff',
  '#d9d9d9',
  '#b8b8b8',
  '#9c9c9c',
  '#808080',
  '#636363',
  '#4a4a4a',
  '#2e2e2e',
  '#0f0f0f',
  '#000000',
];

const SWATCHES = [
  [
    '#fccbcd',
    '#ffe2b2',
    '#fff9c4',
    '#c8e6c9',
    '#ace5dc',
    '#b2ebf2',
    '#bbd9fb',
    '#d1c4e9',
    '#e1bee7',
    '#f8bbd0',
  ],
  [
    '#faa1a4',
    '#ffcc80',
    '#fff59d',
    '#a5d6a7',
    '#70ccbd',
    '#80deea',
    '#90bff9',
    '#b39ddb',
    '#ce93d8',
    '#f48fb1',
  ],
  [
    '#f77c80',
    '#ffb74d',
    '#fff176',
    '#81c784',
    '#42bda8',
    '#4dd0e1',
    '#5b9cf6',
    '#9575cd',
    '#ba68c8',
    '#f06292',
  ],
  [
    '#f7525f',
    '#ffa726',
    '#ffee58',
    '#66bb6a',
    '#22ab94',
    '#26c6da',
    '#3179f5',
    '#7e57c2',
    '#ab47bc',
    '#ec407a',
  ],
  [
    '#b22833',
    '#f57c00',
    '#fbc02d',
    '#388e3c',
    '#056656',
    '#0097a7',
    '#1848cc',
    '#512da8',
    '#7b1fa2',
    '#c2185b',
  ],
  [
    '#801922',
    '#e65100',
    '#f57f17',
    '#1b5e20',
    '#00332a',
    '#006064',
    '#0c3299',
    '#311b92',
    '#4a148c',
    '#880e4f',
  ],
] as const;

export function ColorPicker({ selectedColor, onSelect, onClose }: ColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="rounded-md border border-white/8 p-2 shadow-xl"
      style={{ background: bg.panel }}
    >
      {/* Grayscale row */}
      <div className="grid grid-cols-10 gap-1">
        {GRAYS.map((c) => {
          const isSelected = selectedColor?.toLowerCase() === c;
          return (
            <button
              key={c}
              onClick={() => {
                onSelect(c);
                onClose();
              }}
              className={`h-5 w-5 rounded-sm transition-transform hover:scale-125 ${
                isSelected ? 'ring-2 ring-white/60 ring-offset-[1.5px] ring-offset-[#25234e]' : ''
              } ${c === '#ffffff' ? 'border border-white/20' : 'border border-white/10'}`}
              style={{ background: c }}
              aria-label={c}
            />
          );
        })}
      </div>

      {/* Separator */}
      <div className="my-1.5 h-px rounded-full bg-white/8" />

      {/* Color swatch rows */}
      {SWATCHES.map((row, ri) => (
        <div key={ri} className="grid grid-cols-10 gap-1">
          {row.map((c) => {
            const isSelected = selectedColor?.toLowerCase() === c;
            return (
              <button
                key={c}
                onClick={() => {
                  onSelect(c);
                  onClose();
                }}
                className={`h-5 w-5 rounded-sm border border-white/10 transition-transform hover:scale-125 ${
                  isSelected ? 'ring-2 ring-white/60 ring-offset-[1.5px] ring-offset-[#25234e]' : ''
                }`}
                style={{ background: c }}
                aria-label={c}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
