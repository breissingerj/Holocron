/**
 * VolumeLevel.ts — Shared volume level reader for Holocron voice/notification system
 *
 * Reads $HOLOCRON_MEMORY_DIR/STATE/volume.level (0-4) to determine what audio/notification
 * behavior is currently active.
 *
 * Levels:
 *   0 — silent:  no voice, no notification banners
 *   1 — quiet:   notification banners only, no chime, no TTS
 *   2 — chime:   notification banners + chime, no TTS
 *   3 — focused: banners + chime + TTS on final agent message only (not phase transitions)
 *   4 — full:    banners + chime + TTS everywhere (default when file absent)
 *
 * Set HOLOCRON_MEMORY_DIR to point at your private memory repo (same env var used by the
 * install script). Falls back to ~/.holocron/memory if unset.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HOLOCRON_MEMORY_DIR = process.env.HOLOCRON_MEMORY_DIR || join(homedir(), '.holocron', 'memory');
const STATE_DIR = join(HOLOCRON_MEMORY_DIR, 'STATE');
export const VOLUME_LEVEL_PATH = join(STATE_DIR, 'volume.level');
export const LEGACY_MUTE_PATH = join(STATE_DIR, 'voice.muted');

export type VolumeLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Read the current volume level.
 * Returns 4 (full) if no state file exists.
 */
export function getVolumeLevel(): VolumeLevel {
  if (existsSync(VOLUME_LEVEL_PATH)) {
    const raw = readFileSync(VOLUME_LEVEL_PATH, 'utf-8').trim();
    const n = parseInt(raw, 10);
    if (n >= 0 && n <= 4) return n as VolumeLevel;
  }

  // Backward compat: legacy voice.muted file = level 0
  if (existsSync(LEGACY_MUTE_PATH)) return 0;

  // Default: full capability
  return 4;
}

/** True if TTS voice should fire everywhere — phase transitions, prompts, final messages (level 4 only). */
export function shouldSpeak(): boolean {
  return getVolumeLevel() >= 4;
}

/** True if TTS voice should fire on the final agent message (levels 3 and 4). */
export function shouldSpeakFinal(): boolean {
  return getVolumeLevel() >= 3;
}

/** True if notification banners should show (level 1+). */
export function shouldNotify(): boolean {
  return getVolumeLevel() >= 1;
}

/** True if notification chime should play (level 2+). */
export function shouldChime(): boolean {
  return getVolumeLevel() >= 2;
}

/** Label for display. */
export function levelLabel(level: VolumeLevel): string {
  const labels: Record<VolumeLevel, string> = {
    0: '🔇 SILENT (no voice, no notifications)',
    1: '🔔 QUIET (notifications only, no chime or voice)',
    2: '🔔🎵 CHIME (notifications with chime, no voice)',
    3: '🎯 FOCUSED (voice on final message only, not phase transitions)',
    4: '🔊 FULL (voice + notifications + chime everywhere)',
  };
  return labels[level];
}
