/*
 * lightweight-charts-drawing 0.4.0 — forked from https://github.com/deepentropy/lightweight-charts-drawing
 * (tag v0.4.0, commit 6bebe05dd2b4c72807cfcb18c8466893178fa5c4).
 * Copyright (c) 2026 deepentropy. MIT License — see ./LICENSE.
 * Modified in this repository; see ./README.md for the local changes.
 */

/**
 * lightweight-charts-drawing 0.2
 *
 * TradingView-style drawing tools for lightweight-charts v5, built on a shared
 * drawing core (src/core: tool model + TradingView factory defaults, hit tests,
 * placement / drag rules, renderer-neutral scenes) and a canvas runtime
 * (src/runtime: DrawingManager).
 *
 * @packageDocumentation
 */

// ============ Runtime ============
export {
  DrawingManager,
  type DrawingManagerEvents,
  type DrawingManagerOptions,
  type MagnetMode,
  type TableOp,
} from './runtime/manager';
export { makeCoords, timeToXFallback } from './runtime/coords';
export {
  drawScene,
  TV_ANCHOR_COLOR,
  type AnchorStyle,
  type CanvasSceneOptions,
} from './runtime/scene-canvas';

// ============ Core model ============
export {
  DEFAULT_STYLE,
  isVisibleOnInterval,
  type DataPoint,
  type Drawing,
  type DrawingKind,
  type DrawingStyle,
  type LevelDef,
  type NewDrawing,
  type VolumeProfileStyle,
} from './core/types';
export {
  OVERLAY_SPECS,
  defaultStyleFor,
  factoryStyleFor,
  findOverlaySpec,
  setDefaultStyleOverride,
  volumeProfileDefaults,
  volumeProfileStyle,
  type OverlaySpec,
} from './core/specs';
export type { Coords, OHLC } from './core/coords';
export type { Pt, HitResult } from './core/_shared';
export { parseDrawings, migrateDrawing } from './core/serialize';

// ============ Scenes and hit tests (hosts drawing their own way) ============
export { sceneOf, sceneLockedAnchors, type SceneContext } from './core/scene';
export { fibLevelAt } from './core/scene/fib';
// Local change (cryptopapertrade): pill labels for the horizontal fib levels
export { setFibLabelMode, type FibLabelMode } from './core/kinds/fib-labels';
export type { Scene, SceneItem, Paint, Shadow } from './core/scene/types';
export { hitTestKind } from './core/kinds/hit-tests';
// Local change (cryptopapertrade): the position tools' levels, qty and stats, for "Create limit
// order…" and the host's Inputs / Style tabs
export {
  POSITION_STATS,
  levelFromPrice,
  positionLevels,
  positionQty,
  positionStatOn,
} from './core/kinds/position';
export type { PositionStatKey } from './core/types';
export {
  drawingAxisLabels,
  type PriceAxisLabel,
  type TimeAxisLabel,
} from './core/kinds/axis-labels';

// ============ Host hooks: images, tables ============
export {
  cacheImage,
  decodeImage,
  setImageReader,
  onImagesChanged,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_SIDE,
  IMAGE_TYPES,
  type LoadedImage,
} from './core/kinds/images';
export type { TableCellRef, TableUi } from './core/kinds/table';
// Local change (cryptopapertrade, 2026-10-04): the host's cell editor reads a cell's text
export { tableCells } from './core/kinds/table';

// ============ Interaction rules ============
export { finishPlacement, buildNewDrawing } from './core/interact/placement';
export { applyDrag, anchorCursor, type DragState } from './core/interact/drag';
export { ANCHORABLE_KINDS, isAnchorable, toggleAnchored } from './core/interact/anchor';

// package.json version (upstream sets it at build time with a vite define; the fork pins it).
export const VERSION: string = '0.4.0';
