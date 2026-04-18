/**
 * useTradingSound
 *
 * Provides synthesized audio feedback for paper-trading events using the
 * Web Audio API. All sounds are generated programmatically — no audio files
 * are needed.
 *
 * Sound catalogue:
 *   playOrderPlaced()  — crisp double-tick (market order confirmed)
 *   playOrderQueued()  — soft single ping (limit/stop order placed, pending)
 *   playOrderFilled()  — satisfying bell chime (pending order triggered & filled)
 *   playProfit()       — ascending 4-note coin jingle 🪙 (close with profit)
 *   playLoss()         — descending 2-note soft beep (close with loss)
 *
 * Settings (persisted to localStorage):
 *   volume  — 0 to 1 (default 0.6)
 *   muted   — boolean (default false)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Persistence ─────────────────────────────────────────────────────────────

const LS_KEY = 'cd-trading-sound';

interface SoundSettings {
  volume: number;
  muted: boolean;
}

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as SoundSettings;
  } catch {
    // ignore
  }
  return { volume: 0.6, muted: false };
}

function saveSettings(s: SoundSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

/** Lazy-create a shared AudioContext (suspended until first user gesture). */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  // Store on window so we only ever create one
  if (!(window as unknown as Record<string, unknown>).__cdAudioCtx) {
    try {
      (window as unknown as Record<string, unknown>).__cdAudioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return (window as unknown as Record<string, unknown>).__cdAudioCtx as AudioContext;
}

/** Resume AudioContext if it was suspended (browsers require a user gesture). */
function resumeCtx(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
}

interface NoteOptions {
  freq: number;       // Hz
  type?: OscillatorType;
  gain?: number;      // 0–1
  startTime: number;  // AudioContext time
  duration: number;   // seconds
  attackTime?: number;
  releaseTime?: number;
  masterGain: GainNode;
}

/** Play a single synthesized note by scheduling oscillator nodes. */
function scheduleNote({
  freq,
  type = 'sine',
  gain = 1,
  startTime,
  duration,
  attackTime = 0.005,
  releaseTime = 0.04,
  masterGain,
}: NoteOptions) {
  const ctx = masterGain.context;

  const osc = ctx.createOscillator();
  const envGain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  // Envelope: attack → sustain → release
  envGain.gain.setValueAtTime(0, startTime);
  envGain.gain.linearRampToValueAtTime(gain, startTime + attackTime);
  envGain.gain.setValueAtTime(gain, startTime + duration - releaseTime);
  envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(envGain);
  envGain.connect(masterGain);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface TradingSoundAPI {
  volume: number;
  muted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  playOrderPlaced: () => void;
  playOrderQueued: () => void;
  playOrderFilled: () => void;
  playProfit: () => void;
  playLoss: () => void;
}

export function useTradingSound(): TradingSoundAPI {
  const [settings, setSettings] = useState<SoundSettings>(loadSettings);

  // Keep a GainNode wired to ctx.destination — volume changes apply instantly.
  const masterGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.value = settings.muted ? 0 : settings.volume;
    gain.connect(ctx.destination);
    masterGainRef.current = gain;
    return () => {
      gain.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — volume updates handled below

  // Sync master gain whenever volume / muted changes
  useEffect(() => {
    const g = masterGainRef.current;
    if (!g) return;
    g.gain.value = settings.muted ? 0 : settings.volume;
  }, [settings.volume, settings.muted]);

  const updateSettings = useCallback((patch: Partial<SoundSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const setVolume = useCallback(
    (v: number) => updateSettings({ volume: Math.max(0, Math.min(1, v)) }),
    [updateSettings]
  );

  const toggleMute = useCallback(
    () => updateSettings({ muted: !settings.muted }),
    [updateSettings, settings.muted]
  );

  // ── Helper to get a ready-to-use context ──────────────────────────────────

  function getReady(): { ctx: AudioContext; master: GainNode } | null {
    const ctx = getAudioContext();
    const master = masterGainRef.current;
    if (!ctx || !master) return null;
    resumeCtx(ctx);
    return { ctx, master };
  }

  // ── Sound implementations ─────────────────────────────────────────────────

  /**
   * ORDER PLACED (market) — crisp double-tick
   * Two short "click" pulses: triangle wave C5 then E5, each 60 ms.
   * Feels like a physical button press confirming the trade.
   */
  const playOrderPlaced = useCallback(() => {
    const ready = getReady();
    if (!ready) return;
    const { ctx, master } = ready;
    const now = ctx.currentTime;
    scheduleNote({ freq: 523.25, type: 'triangle', gain: 0.55, startTime: now, duration: 0.06, releaseTime: 0.04, masterGain: master });
    scheduleNote({ freq: 659.25, type: 'triangle', gain: 0.45, startTime: now + 0.07, duration: 0.06, releaseTime: 0.04, masterGain: master });
  }, []);

  /**
   * ORDER QUEUED (limit/stop placed, waiting) — soft single sine ping
   * A gentle A4 (440 Hz) fade, 200 ms — "I'm waiting for you."
   */
  const playOrderQueued = useCallback(() => {
    const ready = getReady();
    if (!ready) return;
    const { ctx, master } = ready;
    const now = ctx.currentTime;
    scheduleNote({ freq: 440, type: 'sine', gain: 0.4, startTime: now, duration: 0.22, attackTime: 0.01, releaseTime: 0.12, masterGain: master });
  }, []);

  /**
   * ORDER FILLED (limit/stop triggered) — satisfying bell chime
   * G5 (784 Hz) primary + partial 5th harmonic, 350 ms exponential decay.
   * Sounds like a real trading terminal bell.
   */
  const playOrderFilled = useCallback(() => {
    const ready = getReady();
    if (!ready) return;
    const { ctx, master } = ready;
    const now = ctx.currentTime;
    // Fundamental
    scheduleNote({ freq: 784, type: 'sine', gain: 0.6, startTime: now, duration: 0.38, attackTime: 0.004, releaseTime: 0.28, masterGain: master });
    // 5th harmonic shimmer (quieter)
    scheduleNote({ freq: 784 * 1.5, type: 'sine', gain: 0.2, startTime: now, duration: 0.24, attackTime: 0.004, releaseTime: 0.18, masterGain: master });
    // Sparkle overtone
    scheduleNote({ freq: 784 * 2, type: 'sine', gain: 0.08, startTime: now, duration: 0.15, attackTime: 0.002, releaseTime: 0.12, masterGain: master });
  }, []);

  /**
   * PROFIT CLOSE 🪙 — ascending 4-note coin jingle
   * C5 → E5 → G5 → C6, each note 120 ms, overlapping like a musical run.
   * "Cha-ching" energy — makes traders feel rewarded!
   */
  const playProfit = useCallback(() => {
    const ready = getReady();
    if (!ready) return;
    const { ctx, master } = ready;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    const spacing = 0.1; // 100 ms between note starts

    notes.forEach((freq, i) => {
      const startTime = now + i * spacing;
      const isLast = i === notes.length - 1;
      scheduleNote({
        freq,
        type: 'sine',
        gain: 0.45 + i * 0.04, // slight crescendo
        startTime,
        duration: isLast ? 0.38 : 0.18,
        attackTime: 0.006,
        releaseTime: isLast ? 0.28 : 0.08,
        masterGain: master,
      });
      // Add a subtle triangle layer for "metallic coin" shimmer
      scheduleNote({
        freq: freq * 2,
        type: 'triangle',
        gain: 0.08,
        startTime,
        duration: 0.1,
        attackTime: 0.002,
        releaseTime: 0.07,
        masterGain: master,
      });
    });
  }, []);

  /**
   * LOSS CLOSE — soft descending 2-note acknowledgement
   * G4 → D4, 160 ms each, sine wave with gentle fade.
   * Acknowledges the loss without being obnoxious or rubbing it in.
   */
  const playLoss = useCallback(() => {
    const ready = getReady();
    if (!ready) return;
    const { ctx, master } = ready;
    const now = ctx.currentTime;
    scheduleNote({ freq: 392, type: 'sine', gain: 0.35, startTime: now, duration: 0.18, attackTime: 0.008, releaseTime: 0.12, masterGain: master });
    scheduleNote({ freq: 293.66, type: 'sine', gain: 0.28, startTime: now + 0.16, duration: 0.22, attackTime: 0.008, releaseTime: 0.16, masterGain: master });
  }, []);

  return {
    volume: settings.volume,
    muted: settings.muted,
    setVolume,
    toggleMute,
    playOrderPlaced,
    playOrderQueued,
    playOrderFilled,
    playProfit,
    playLoss,
  };
}

