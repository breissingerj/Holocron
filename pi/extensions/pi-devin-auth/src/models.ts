/**
 * Model list for the Devin (Cognition) provider.
 *
 * Two paths:
 *   1. {@link FALLBACK_MODELS} — 11 static entries shown before login or
 *      when the live catalog fetch fails. Carries real pricing.
 *   2. {@link buildLiveModels} — filters the live `GetCascadeModelConfigs`
 *      catalog to the 11 model families we care about, stamping each entry
 *      with pricing/metadata from {@link MODEL_OVERRIDES}.
 *
 * The catalog only carries `modelUid`, `label`, and `disabled` — it does
 * NOT include context window, max output tokens, reasoning capability, or
 * pricing. We supply all of those from {@link MODEL_OVERRIDES}, keyed by
 * prefix so variants (e.g. `claude-opus-4-8-medium`, `gpt-5-6-sol-low`)
 * inherit the correct metadata from their parent family.
 */

import type { ProviderModelConfig } from '@earendil-works/pi-coding-agent';
import type { CacheEntry } from './cloud-direct/index.js';

/** Default Cognition/Codeium host. */
const DEFAULT_HOST = 'https://server.codeium.com';

/**
 * Prefixes of the 11 model families we want from the live catalog.
 * Prefix matching catches variants (e.g. `swe-1-7-lightning`,
 * `gpt-5-6-sol-low`, `claude-opus-4-8-high`).
 */
export const WANTED_PREFIXES: readonly string[] = [
    'swe-1-7',
    'gpt-5-6-sol',
    'gpt-5-6-luna',
    'gpt-5-6-terra',
    'claude-opus-4-8',
    'claude-fable-5',
    'claude-sonnet-5',
    'glm-5-2',
    'kimi-k2-7',
    'grok-4-5',
];

function matchesWantedPrefix(uid: string): boolean {
    for (const prefix of WANTED_PREFIXES) {
        if (uid === prefix || uid.startsWith(prefix + '-') || uid.startsWith(prefix + '_')) {
            return true;
        }
    }
    return false;
}

/**
 * Per-model metadata + pricing, keyed by prefix.
 *
 * All prices are per million tokens (USD). Used by both
 * {@link FALLBACK_MODELS} and {@link buildLiveModels} so there is a single
 * source of truth for pricing.
 *
 * ## Provenance (verified 2026-08-06)
 *
 * Cognition's `GetCascadeModelConfigs` returns only `modelUid`, `label`, and
 * `disabled` — no window, output cap, or pricing — so every number below is
 * supplied locally. Values were reconciled against pi's own bundled model
 * catalog (`@earendil-works/pi-ai/dist/providers/data/*.json`), which is the
 * best available authority since Cascade routes to these same upstream models.
 *
 * Resolution order used:
 *   1. First-party provider entry (anthropic / openai / xai / moonshotai / zai).
 *   2. If first-party lists cost 0 because it is a subscription-only plan
 *      (zai for glm), fall back to OpenRouter's pay-as-you-go rate as a proxy.
 *   3. If no upstream model exists at all (the `swe-1-*` family is Cognition
 *      proprietary), values are UNVERIFIED — see per-entry notes.
 *
 * Note: `gpt-5-6-*` upstream carries a long-context surcharge tier above
 * 272K input tokens. `ModelMeta` has no tier field, so only the base rate is
 * represented here; effective cost can be ~2x at the very top of the window.
 *
 * Caveat: these are the *upstream model* capabilities. Cognition may impose
 * its own lower ceilings inside Cascade; if a request fails with a context
 * error well below the window listed here, that is the likely cause.
 */
interface ModelMeta {
    contextWindow: number;
    maxTokens: number;
    reasoning: boolean;
    input: ('text' | 'image')[];
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
    };
}

const MODEL_META: Map<string, ModelMeta> = new Map([
    // Cognition proprietary — no upstream model in pi's catalog.
    // UNVERIFIED: window/output are the vendored author's original values and
    // cost is genuinely unknown (Cognition publishes no per-token rate; usage
    // draws from the subscription's credits instead).
    ['swe-1-7', {
        contextWindow: 256_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }],
    // Cognition proprietary — UNVERIFIED, as above.
    ['swe-1-7-lightning', {
        contextWindow: 256_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 2.50, output: 12.50, cacheRead: 0.25, cacheWrite: 3.13 },
    }],
    // openai first-party gpt-5.6-sol (was wrongly 1_050_000 ctx).
    ['gpt-5-6-sol', {
        contextWindow: 272_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 5.00, output: 30.00, cacheRead: 0.50, cacheWrite: 6.25 },
    }],
    // openai first-party gpt-5.6-luna (was wrongly 1_050_000 ctx).
    ['gpt-5-6-luna', {
        contextWindow: 272_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 1.00, output: 6.00, cacheRead: 0.10, cacheWrite: 1.25 },
    }],
    // openai first-party gpt-5.6-terra (was wrongly 1_050_000 ctx).
    ['gpt-5-6-terra', {
        contextWindow: 272_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 2.50, output: 15.00, cacheRead: 0.25, cacheWrite: 3.125 },
    }],
    // anthropic first-party claude-opus-4-8 (was wrongly 200_000 ctx).
    ['claude-opus-4-8', {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
    }],
    // anthropic first-party claude-fable-5 — already correct, verified unchanged.
    ['claude-fable-5', {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 10.00, output: 50.00, cacheRead: 1.00, cacheWrite: 12.50 },
    }],
    // anthropic first-party claude-sonnet-5. Previously wrong on all three:
    // ctx 200K→1M, output 64K→128K, cost 3/15/0.30/3.75 → 2/10/0.20/2.50.
    ['claude-sonnet-5', {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 2.00, output: 10.00, cacheRead: 0.20, cacheWrite: 2.50 },
    }],
    // zai first-party glm-5.2 for window/output (131_072, not 131_000).
    // zai lists cost 0 (subscription coding plan), so pricing is OpenRouter's
    // pay-as-you-go rate for z-ai/glm-5.2. No cache-write billing upstream.
    ['glm-5-2', {
        contextWindow: 1_000_000,
        maxTokens: 131_072,
        reasoning: true,
        input: ['text'],
        cost: { input: 0.68, output: 2.14, cacheRead: 0.13, cacheWrite: 0 },
    }],
    // moonshotai first-party kimi-k2.7-code — 262_144 (2^18), not 256_000.
    // No cache-write billing upstream (was wrongly 1.19).
    ['kimi-k2-7', {
        contextWindow: 262_144,
        maxTokens: 262_144,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 0.95, output: 4.00, cacheRead: 0.19, cacheWrite: 0 },
    }],
    // xai first-party grok-4.5 — output cap is the full 500K, not 128K.
    // cacheRead 0.50→0.30 and no cache-write billing upstream.
    ['grok-4-5', {
        contextWindow: 500_000,
        maxTokens: 500_000,
        reasoning: true,
        input: ['text', 'image'],
        cost: { input: 2.00, output: 6.00, cacheRead: 0.30, cacheWrite: 0 },
    }],
]);

/**
 * Find the best-matching metadata for a UID by longest-prefix match
 * against {@link MODEL_META}. This lets `swe-1-7-lightning` match the
 * `swe-1-7-lightning` entry (specific) and `gpt-5-6-sol-low` match the
 * `gpt-5-6-sol` entry (parent family).
 */
function findMeta(uid: string): ModelMeta | undefined {
    let best: { key: string; meta: ModelMeta } | null = null;
    for (const [key, meta] of MODEL_META) {
        if (uid === key || uid.startsWith(key + '-') || uid.startsWith(key + '_')) {
            if (!best || key.length > best.key.length) {
                best = { key, meta };
            }
        }
    }
    return best?.meta;
}

/** Conservative defaults for catalog UIDs not in the override table. */
const DEFAULT_META: ModelMeta = {
    contextWindow: 256_000,
    maxTokens: 128_000,
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function makeModel(id: string, name: string, meta: ModelMeta): ProviderModelConfig {
    return {
        id,
        name,
        reasoning: meta.reasoning,
        input: meta.input,
        cost: meta.cost,
        contextWindow: meta.contextWindow,
        maxTokens: meta.maxTokens,
    };
}

/**
 * Static fallback list — 11 models with real pricing.
 * Shown before login or when the live catalog fetch fails.
 */
export const FALLBACK_MODELS: ProviderModelConfig[] = [
    makeModel('swe-1-7', 'SWE-1.7', MODEL_META.get('swe-1-7')!),
    makeModel('swe-1-7-lightning', 'SWE-1.7 Lightning', MODEL_META.get('swe-1-7-lightning')!),
    makeModel('gpt-5-6-sol', 'GPT-5.6 Sol', MODEL_META.get('gpt-5-6-sol')!),
    makeModel('gpt-5-6-luna', 'GPT-5.6 Luna', MODEL_META.get('gpt-5-6-luna')!),
    makeModel('gpt-5-6-terra', 'GPT-5.6 Terra', MODEL_META.get('gpt-5-6-terra')!),
    makeModel('claude-opus-4-8', 'Claude Opus 4.8', MODEL_META.get('claude-opus-4-8')!),
    makeModel('claude-fable-5', 'Claude Fable 5', MODEL_META.get('claude-fable-5')!),
    makeModel('claude-sonnet-5', 'Claude Sonnet 5', MODEL_META.get('claude-sonnet-5')!),
    makeModel('glm-5-2', 'GLM-5.2', MODEL_META.get('glm-5-2')!),
    makeModel('kimi-k2-7', 'Kimi K2.7', MODEL_META.get('kimi-k2-7')!),
    makeModel('grok-4-5', 'Grok 4.5', MODEL_META.get('grok-4-5')!),
];

/**
 * Build the model list from a live catalog response.
 *
 * Filters to the 11 wanted families via {@link WANTED_PREFIXES}, skips
 * disabled entries, and stamps each with pricing/metadata from
 * {@link MODEL_META}. Falls back to {@link FALLBACK_MODELS} when the
 * catalog is null, empty, or contains none of our wanted models.
 */
export function buildLiveModels(catalog: CacheEntry | null): ProviderModelConfig[] {
    if (!catalog || catalog.byUid.size === 0) {
        return FALLBACK_MODELS;
    }

    const models: ProviderModelConfig[] = [];
    for (const entry of catalog.byUid.values()) {
        if (entry.disabled) continue;
        if (!matchesWantedPrefix(entry.modelUid)) continue;
        const meta = findMeta(entry.modelUid) ?? DEFAULT_META;
        models.push(makeModel(entry.modelUid, entry.label || entry.modelUid, meta));
    }

    if (models.length === 0) {
        return FALLBACK_MODELS;
    }

    return models;
}

export { DEFAULT_HOST };
