---
name: volume
description: Toggle voice notifications on/off for meeting mode. USE WHEN user says /volume, /mute, mute voice, unmute voice, silence voice, enable voice, mute notifications, meeting mode, quiet mode, suppress voice, toggle voice, volume level, set volume, set level.
---

# Voice/Notification Volume Control

Controls Holocron's voice and notification behavior via a 5-level volume system.

**Levels:**
| Level | Name | Behavior |
|-------|------|----------|
| 0 | Silent | No TTS, no notification banners |
| 1 | Quiet | Notification banners only (no chime, no TTS) |
| 2 | Chime | Notification banners with system chime (no TTS) |
| 3 | Focused | Banners + chime + TTS on final agent message only (not phase transitions) |
| 4 | Full | Banners + chime + TTS everywhere (default) |

**State file:** `$HOLOCRON_MEMORY_DIR/STATE/volume.level` (contains "0"-"4")

## Implementation

Requires `HOLOCRON_DIR` to be set to the Holocron repo root.

To cycle to the next level (4→0→1→2→3→4):
```bash
bun $HOLOCRON_DIR/tools/ToggleMute.ts
```

To jump directly to a specific level (e.g., level 2):
```bash
bun $HOLOCRON_DIR/tools/ToggleMute.ts 2
```

The tool prints the new level label. Relay it to the user.

**Example outputs:**
- `🔇 SILENT (no voice, no notifications)` → "Voice and notifications fully silenced."
- `🔔 QUIET (notifications only, no chime or voice)` → "Quiet mode: banners only, no chime or voice."
- `🔔🎵 CHIME (notifications with chime, no voice)` → "Chime mode: banners with system chime, no voice."
- `🎯 FOCUSED (voice on final message only, not phase transitions)` → "Focused mode: voice on completions only."
- `🔊 FULL (voice + notifications + chime everywhere)` → "Full mode: voice and notifications restored."
