#!/usr/bin/env bun
/**
 * ToggleMute.ts — Voice/notification volume level control
 *
 * With no argument: cycles 0 → 1 → 2 → 3 → 4 → 0
 * With numeric argument 0-4: jumps directly to that level
 *
 * Levels:
 *   0 — silent:  no voice, no notification banners
 *   1 — quiet:   notification banners, no chime, no TTS
 *   2 — chime:   notifications with chime, no TTS
 *   3 — focused: banners + chime + TTS on final agent message only
 *   4 — full:    voice + notifications + chime everywhere (default)
 *
 * Usage:
 *   bun ToggleMute.ts       # cycle to next level
 *   bun ToggleMute.ts 0     # jump to silent
 *   bun ToggleMute.ts 4     # jump to full
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import {
  getVolumeLevel,
  levelLabel,
  VOLUME_LEVEL_PATH,
  LEGACY_MUTE_PATH,
  type VolumeLevel,
} from './VolumeLevel';

function setLevel(level: VolumeLevel): void {
  mkdirSync(dirname(VOLUME_LEVEL_PATH), { recursive: true });
  writeFileSync(VOLUME_LEVEL_PATH, String(level));

  // Migrate away from legacy voice.muted file
  if (existsSync(LEGACY_MUTE_PATH)) {
    unlinkSync(LEGACY_MUTE_PATH);
  }
}

function nextLevel(current: VolumeLevel): VolumeLevel {
  return ((current + 1) % 5) as VolumeLevel;
}

const arg = process.argv[2];
let targetLevel: VolumeLevel;

if (arg !== undefined) {
  const n = parseInt(arg, 10);
  if (isNaN(n) || n < 0 || n > 4) {
    console.error('Usage: bun ToggleMute.ts [0-4]');
    process.exit(1);
  }
  targetLevel = n as VolumeLevel;
} else {
  targetLevel = nextLevel(getVolumeLevel());
}

setLevel(targetLevel);
console.log(levelLabel(targetLevel));
