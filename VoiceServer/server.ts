#!/usr/bin/env bun
/**
 * Voice Server - Holocron voice notification server using ElevenLabs TTS
 *
 * Architecture: Pure pass-through. All voice config comes from config.json.
 * The server has zero hardcoded voice parameters.
 *
 * Config resolution (3-tier):
 *   1. Caller sends voice_settings in request body → use directly (pass-through)
 *   2. Caller sends voice_id → look up in config.json voices → use those settings
 *   3. Neither → use config.json voices.main as default
 *
 * Config path: $HOLOCRON_VOICE_CONFIG or ./config.json (relative to server.ts)
 *
 * Pronunciation preprocessing: loads pronunciations.json and applies
 * word-boundary replacements before sending text to ElevenLabs TTS.
 */

import { serve } from "bun";
import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

// Load .env from user home directory
const envPath = join(homedir(), '.env');
if (existsSync(envPath)) {
  const envContent = await Bun.file(envPath).text();
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value && !key.startsWith('#')) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const PORT = parseInt(process.env.PORT || "8888");
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!ELEVENLABS_API_KEY) {
  console.error('⚠️  ELEVENLABS_API_KEY not found in ~/.env');
  console.error('Add: ELEVENLABS_API_KEY=your_key_here');
}

// ==========================================================================
// Pronunciation System
// ==========================================================================

interface PronunciationEntry {
  term: string;
  phonetic: string;
  note?: string;
}

interface PronunciationConfig {
  replacements: PronunciationEntry[];
}

// Compiled pronunciation rules (loaded once at startup)
interface CompiledRule {
  regex: RegExp;
  phonetic: string;
}

let pronunciationRules: CompiledRule[] = [];

// Load and compile pronunciation rules from pronunciations.json
function loadPronunciations(): void {
  const pronPath = join(import.meta.dir, 'pronunciations.json');
  try {
    if (!existsSync(pronPath)) {
      console.warn('⚠️  No pronunciations.json found — TTS will use default pronunciations');
      return;
    }
    const content = readFileSync(pronPath, 'utf-8');
    const config: PronunciationConfig = JSON.parse(content);

    pronunciationRules = config.replacements.map(entry => ({
      regex: new RegExp(`\\b${escapeRegex(entry.term)}\\b`, 'g'),
      phonetic: entry.phonetic,
    }));

    console.log(`📖 Loaded ${pronunciationRules.length} pronunciation rules`);
    for (const entry of config.replacements) {
      console.log(`   ${entry.term} → ${entry.phonetic} (${entry.note || ''})`);
    }
  } catch (error) {
    console.error('⚠️  Failed to load pronunciations.json:', error);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPronunciations(text: string): string {
  let result = text;
  for (const rule of pronunciationRules) {
    result = result.replace(rule.regex, rule.phonetic);
  }
  return result;
}

loadPronunciations();

// ==========================================================================
// Voice Configuration — Single Source of Truth: config.json
// ==========================================================================

interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  speed?: number;
  use_speaker_boost?: boolean;
}

interface VoiceEntry {
  voiceId: string;
  voiceName?: string;
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean;
  volume: number;
}

interface LoadedVoiceConfig {
  defaultVoiceId: string;
  voices: Record<string, VoiceEntry>;
  voicesByVoiceId: Record<string, VoiceEntry>;
  desktopNotifications: boolean;
}

const FALLBACK_VOICE_SETTINGS: ElevenLabsVoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  speed: 1.0,
  use_speaker_boost: true,
};
const FALLBACK_VOLUME = 1.0;

// Load voice configuration from config.json (or $HOLOCRON_VOICE_CONFIG path)
function loadVoiceConfig(): LoadedVoiceConfig {
  const configPath = process.env.HOLOCRON_VOICE_CONFIG || join(import.meta.dir, 'config.json');

  try {
    if (!existsSync(configPath)) {
      console.warn(`⚠️  Voice config not found at ${configPath} — using fallback defaults`);
      console.warn('    Copy VoiceServer/config.json.example to config.json and fill in your voice IDs');
      return { defaultVoiceId: '', voices: {}, voicesByVoiceId: {}, desktopNotifications: true };
    }

    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    const voicesSection = config.voices || {};
    const desktopNotifications = config.desktopNotifications !== false;

    const voices: Record<string, VoiceEntry> = {};
    const voicesByVoiceId: Record<string, VoiceEntry> = {};

    for (const [name, cfg] of Object.entries(voicesSection)) {
      const entry = cfg as any;
      if (entry.voiceId) {
        const voiceEntry: VoiceEntry = {
          voiceId: entry.voiceId,
          voiceName: entry.voiceName,
          stability: entry.stability ?? 0.5,
          similarity_boost: entry.similarity_boost ?? entry.similarityBoost ?? 0.75,
          style: entry.style ?? 0.0,
          speed: entry.speed ?? 1.0,
          use_speaker_boost: entry.use_speaker_boost ?? entry.useSpeakerBoost ?? true,
          volume: entry.volume ?? 1.0,
        };
        voices[name] = voiceEntry;
        voicesByVoiceId[entry.voiceId] = voiceEntry;
      }
    }

    const defaultVoiceId = voices.main?.voiceId || '';

    const voiceNames = Object.keys(voices);
    console.log(`✅ Loaded ${voiceNames.length} voice config(s) from ${configPath}: ${voiceNames.join(', ')}`);
    for (const [name, entry] of Object.entries(voices)) {
      console.log(`   ${name}: ${entry.voiceName || entry.voiceId} (speed: ${entry.speed}, stability: ${entry.stability})`);
    }

    return { defaultVoiceId, voices, voicesByVoiceId, desktopNotifications };
  } catch (error) {
    console.error('⚠️  Failed to load voice config:', error);
    return { defaultVoiceId: '', voices: {}, voicesByVoiceId: {}, desktopNotifications: true };
  }
}

const voiceConfig = loadVoiceConfig();
const DEFAULT_VOICE_ID = voiceConfig.defaultVoiceId || process.env.ELEVENLABS_VOICE_ID || "s3TPKV1kjDlVtZbl4Ksh";
const NOTIFICATION_ICON = process.env.HOLOCRON_NOTIFICATION_ICON || join(import.meta.dir, '..', 'assets', 'icon.png');

function lookupVoiceByVoiceId(voiceId: string): VoiceEntry | null {
  return voiceConfig.voicesByVoiceId[voiceId] || null;
}

function voiceEntryToSettings(entry: VoiceEntry): ElevenLabsVoiceSettings {
  return {
    stability: entry.stability,
    similarity_boost: entry.similarity_boost,
    style: entry.style,
    speed: entry.speed,
    use_speaker_boost: entry.use_speaker_boost,
  };
}

// Emotional markers for dynamic voice adjustment
interface EmotionalOverlay {
  stability: number;
  similarity_boost: number;
}

// 13 Emotional Presets - Expanded Prosody System
const EMOTIONAL_PRESETS: Record<string, EmotionalOverlay> = {
  'excited': { stability: 0.7, similarity_boost: 0.9 },
  'celebration': { stability: 0.65, similarity_boost: 0.85 },
  'insight': { stability: 0.55, similarity_boost: 0.8 },
  'creative': { stability: 0.5, similarity_boost: 0.75 },
  'success': { stability: 0.6, similarity_boost: 0.8 },
  'progress': { stability: 0.55, similarity_boost: 0.75 },
  'investigating': { stability: 0.6, similarity_boost: 0.85 },
  'debugging': { stability: 0.55, similarity_boost: 0.8 },
  'learning': { stability: 0.5, similarity_boost: 0.75 },
  'pondering': { stability: 0.65, similarity_boost: 0.8 },
  'focused': { stability: 0.7, similarity_boost: 0.85 },
  'caution': { stability: 0.4, similarity_boost: 0.6 },
  'urgent': { stability: 0.3, similarity_boost: 0.9 },
};

function extractEmotionalMarker(message: string): { cleaned: string; emotion?: string } {
  const emojiToEmotion: Record<string, string> = {
    '\u{1F4A5}': 'excited',
    '\u{1F389}': 'celebration',
    '\u{1F4A1}': 'insight',
    '\u{1F3A8}': 'creative',
    '\u{2728}': 'success',
    '\u{1F4C8}': 'progress',
    '\u{1F50D}': 'investigating',
    '\u{1F41B}': 'debugging',
    '\u{1F4DA}': 'learning',
    '\u{1F914}': 'pondering',
    '\u{1F3AF}': 'focused',
    '\u{26A0}\u{FE0F}': 'caution',
    '\u{1F6A8}': 'urgent'
  };

  const emotionMatch = message.match(/\[(\u{1F4A5}|\u{1F389}|\u{1F4A1}|\u{1F3A8}|\u{2728}|\u{1F4C8}|\u{1F50D}|\u{1F41B}|\u{1F4DA}|\u{1F914}|\u{1F3AF}|\u{26A0}\u{FE0F}|\u{1F6A8})\s+(\w+)\]/u);
  if (emotionMatch) {
    const emoji = emotionMatch[1];
    const emotionName = emotionMatch[2].toLowerCase();
    if (emojiToEmotion[emoji] === emotionName) {
      return { cleaned: message.replace(emotionMatch[0], '').trim(), emotion: emotionName };
    }
  }

  return { cleaned: message };
}

function sanitizeForSpeech(input: string): string {
  return input
    .replace(/<script/gi, '')
    .replace(/\.\.\//g, '')
    .replace(/[;&|><`$\\]/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .trim()
    .substring(0, 500);
}

function validateInput(input: any): { valid: boolean; error?: string; sanitized?: string } {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Invalid input type' };
  }
  if (input.length > 500) {
    return { valid: false, error: 'Message too long (max 500 characters)' };
  }
  const sanitized = sanitizeForSpeech(input);
  if (!sanitized || sanitized.length === 0) {
    return { valid: false, error: 'Message contains no valid content after sanitization' };
  }
  return { valid: true, sanitized };
}

async function generateSpeech(
  text: string,
  voiceId: string,
  voiceSettings: ElevenLabsVoiceSettings
): Promise<ArrayBuffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  const pronouncedText = applyPronunciations(text);
  if (pronouncedText !== text) {
    console.log(`📖 Pronunciation: "${text}" → "${pronouncedText}"`);
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: pronouncedText,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: voiceSettings,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  return await response.arrayBuffer();
}

async function playAudio(audioBuffer: ArrayBuffer, volume: number = FALLBACK_VOLUME): Promise<void> {
  const tempFile = `/tmp/holocron-voice-${Date.now()}.mp3`;

  await Bun.write(tempFile, audioBuffer);

  const isDarwin = process.platform === 'darwin';
  const playerCmd = isDarwin ? '/usr/bin/afplay' : 'paplay';
  const playerArgs = isDarwin ? ['-v', volume.toString(), tempFile] : [tempFile];

  return new Promise((resolve, reject) => {
    const proc = spawn(playerCmd, playerArgs);

    proc.on('error', (error) => {
      console.error('Error playing audio:', error);
      reject(error);
    });

    proc.on('exit', (code) => {
      spawn('/bin/rm', [tempFile]);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${playerCmd} exited with code ${code}`));
      }
    });
  });
}

function spawnSafe(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    proc.on('error', (error) => {
      console.error(`Error spawning ${command}:`, error);
      reject(error);
    });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

// ==========================================================================
// Core: Send notification with 3-tier voice settings resolution
// ==========================================================================

async function sendNotification(
  title: string,
  message: string,
  voiceEnabled = true,
  voiceId: string | null = null,
  callerVoiceSettings?: Partial<ElevenLabsVoiceSettings> | null,
  callerVolume?: number | null,
  notificationSound = false,
): Promise<{ voicePlayed: boolean; voiceError?: string }> {
  const titleValidation = validateInput(title);
  const messageValidation = validateInput(message);

  if (!titleValidation.valid) throw new Error(`Invalid title: ${titleValidation.error}`);
  if (!messageValidation.valid) throw new Error(`Invalid message: ${messageValidation.error}`);

  const safeTitle = titleValidation.sanitized!;
  let safeMessage = messageValidation.sanitized!;

  const { cleaned, emotion } = extractEmotionalMarker(safeMessage);
  safeMessage = cleaned;

  let voicePlayed = false;
  let voiceError: string | undefined;

  if (voiceEnabled && ELEVENLABS_API_KEY) {
    try {
      const voice = voiceId || DEFAULT_VOICE_ID;

      let resolvedSettings: ElevenLabsVoiceSettings;
      let resolvedVolume: number;

      if (callerVoiceSettings && Object.keys(callerVoiceSettings).length > 0) {
        resolvedSettings = {
          stability: callerVoiceSettings.stability ?? FALLBACK_VOICE_SETTINGS.stability,
          similarity_boost: callerVoiceSettings.similarity_boost ?? FALLBACK_VOICE_SETTINGS.similarity_boost,
          style: callerVoiceSettings.style ?? FALLBACK_VOICE_SETTINGS.style,
          speed: callerVoiceSettings.speed ?? FALLBACK_VOICE_SETTINGS.speed,
          use_speaker_boost: callerVoiceSettings.use_speaker_boost ?? FALLBACK_VOICE_SETTINGS.use_speaker_boost,
        };
        resolvedVolume = callerVolume ?? FALLBACK_VOLUME;
        console.log(`🔗 Voice settings: pass-through from caller`);
      } else {
        const voiceEntry = lookupVoiceByVoiceId(voice) || voiceConfig.voices.main;
        if (voiceEntry) {
          resolvedSettings = voiceEntryToSettings(voiceEntry);
          resolvedVolume = callerVolume ?? voiceEntry.volume ?? FALLBACK_VOLUME;
          console.log(`📋 Voice settings: from config.json (${voiceEntry.voiceName || voice})`);
        } else {
          resolvedSettings = { ...FALLBACK_VOICE_SETTINGS };
          resolvedVolume = callerVolume ?? FALLBACK_VOLUME;
          console.log(`⚠️  Voice settings: fallback defaults (no config found for ${voice})`);
        }
      }

      if (emotion && EMOTIONAL_PRESETS[emotion]) {
        resolvedSettings = {
          ...resolvedSettings,
          stability: EMOTIONAL_PRESETS[emotion].stability,
          similarity_boost: EMOTIONAL_PRESETS[emotion].similarity_boost,
        };
        console.log(`🎭 Emotion overlay: ${emotion}`);
      }

      console.log(`🎙️  Generating speech (voice: ${voice}, speed: ${resolvedSettings.speed}, stability: ${resolvedSettings.stability}, boost: ${resolvedSettings.similarity_boost}, style: ${resolvedSettings.style}, volume: ${resolvedVolume})`);

      const audioBuffer = await generateSpeech(safeMessage, voice, resolvedSettings);
      await playAudio(audioBuffer, resolvedVolume);
      voicePlayed = true;
    } catch (error: any) {
      console.error("Failed to generate/play speech:", error);
      voiceError = error.message || "TTS generation failed";
    }
  }

  // Desktop notification
  if (voiceConfig.desktopNotifications) {
    try {
      if (process.platform === 'darwin') {
        const args = ['-title', safeTitle, '-message', safeMessage];
        if (existsSync(NOTIFICATION_ICON)) {
          args.push('-appIcon', NOTIFICATION_ICON);
        }
        if (notificationSound) {
          args.push('-sound', 'default');
        }
        await spawnSafe('/opt/homebrew/bin/terminal-notifier', args);
      } else {
        await spawnSafe('notify-send', [safeTitle, safeMessage]);
      }
    } catch (error) {
      console.error("Notification display error:", error);
    }
  }

  return { voicePlayed, voiceError };
}

// Rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const clientIp = req.headers.get('x-forwarded-for') || 'localhost';

    const corsHeaders = {
      "Access-Control-Allow-Origin": "http://localhost",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    if (!checkRateLimit(clientIp)) {
      return new Response(
        JSON.stringify({ status: "error", message: "Rate limit exceeded" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
      );
    }

    if (url.pathname === "/notify" && req.method === "POST") {
      try {
        const data = await req.json();
        const title = data.title || "Holocron";
        const message = data.message || "Task completed";
        const voiceEnabled = data.voice_enabled !== false;
        const voiceId = data.voice_id || data.voice_name || null;
        const voiceSettings = data.voice_settings || null;
        const volume = data.volume ?? null;
        const notificationSound = data.notification_sound === true;

        if (voiceId && typeof voiceId !== 'string') throw new Error('Invalid voice_id');

        console.log(`📨 Notification: "${title}" - "${message}" (voice: ${voiceEnabled}, chime: ${notificationSound}, voiceId: ${voiceId || DEFAULT_VOICE_ID})`);

        const result = await sendNotification(title, message, voiceEnabled, voiceId, voiceSettings, volume, notificationSound);

        if (voiceEnabled && !result.voicePlayed && result.voiceError) {
          return new Response(
            JSON.stringify({ status: "error", message: `TTS failed: ${result.voiceError}`, notification_sent: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
          );
        }

        return new Response(
          JSON.stringify({ status: "success", message: "Notification sent" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      } catch (error: any) {
        console.error("Notification error:", error);
        return new Response(
          JSON.stringify({ status: "error", message: error.message || "Internal server error" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: error.message?.includes('Invalid') ? 400 : 500 }
        );
      }
    }

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          port: PORT,
          voice_system: "ElevenLabs",
          default_voice_id: DEFAULT_VOICE_ID,
          api_key_configured: !!ELEVENLABS_API_KEY,
          pronunciation_rules: pronunciationRules.length,
          configured_voices: Object.keys(voiceConfig.voices),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response("Holocron Voice Server - POST to /notify", {
      headers: corsHeaders,
      status: 200
    });
  },
});

console.log(`🚀 Holocron Voice Server running on port ${PORT}`);
console.log(`🎙️  Using ElevenLabs TTS (default voice: ${DEFAULT_VOICE_ID})`);
console.log(`📡 POST to http://localhost:${PORT}/notify`);
console.log(`🔒 Security: CORS restricted to localhost, rate limiting enabled`);
console.log(`🔑 API Key: ${ELEVENLABS_API_KEY ? '✅ Configured' : '❌ Missing'}`);
console.log(`📖 Pronunciations: ${pronunciationRules.length} rules loaded`);
