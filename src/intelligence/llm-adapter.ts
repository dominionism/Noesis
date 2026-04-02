/**
 * LLM Adapter — Layered CLI-based fallback with API-key final fallback.
 *
 * Noesis runs inside AI coding agents (Claude Code, OpenCode, Kilocode).
 * Rather than requiring a separate API key, it delegates LLM calls to
 * the user's existing CLI agents in priority order:
 *
 *   1. Claude CLI  (`claude -p "prompt"`)       — subscription-based
 *   2. OpenCode    (`opencode run "prompt"`)     — GitHub Education / free models
 *   3. Kilocode    (`kilocode run "prompt"`)     — MiniMax M2.5 free tier
 *   4. API key     (Anthropic / OpenAI raw HTTP) — traditional fallback
 *
 * Each tier is tried in order. On failure, the next tier is attempted.
 * The adapter returns structured JSON from the LLM.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { LlmProvider } from './skill-synthesis.js';

const execFile = promisify(execFileCb);

export interface LlmAdapterConfig {
  provider: string;   // 'anthropic' | 'openai' | 'cli'
  model: string;      // e.g. 'claude-sonnet-4-20250514', 'gpt-4o'
  apiKeyEnv: string;  // env var name, e.g. 'ANTHROPIC_API_KEY'
}

// ---------------------------------------------------------------------------
// CLI provider detection — checks which CLIs are available on PATH
// ---------------------------------------------------------------------------

interface CliTier {
  name: string;
  command: string;
  args: (prompt: string) => string[];
  available: boolean;
}

async function detectAvailableClis(): Promise<CliTier[]> {
  const tiers: CliTier[] = [
    {
      name: 'claude',
      command: 'claude',
      args: (prompt) => ['-p', prompt],
      available: false,
    },
    {
      name: 'opencode',
      command: 'opencode',
      args: (prompt) => ['run', prompt],
      available: false,
    },
    {
      name: 'kilocode',
      command: 'kilocode',
      args: (prompt) => ['run', prompt],
      available: false,
    },
  ];

  for (const tier of tiers) {
    try {
      await execFile('which', [tier.command], { timeout: 5000 });
      tier.available = true;
    } catch {
      // not available
    }
  }

  return tiers.filter(t => t.available);
}

// ---------------------------------------------------------------------------
// CLI-based provider — tries each available CLI in priority order
// ---------------------------------------------------------------------------

function createCliProvider(tiers: CliTier[]): LlmProvider {
  return {
    async generate(prompt: string, schema: Record<string, unknown>): Promise<string> {
      const fullPrompt = `${prompt}\n\nRespond with ONLY valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;
      const errors: string[] = [];

      for (const tier of tiers) {
        try {
          const { stdout } = await execFile(tier.command, tier.args(fullPrompt), {
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
            env: { ...process.env, NO_COLOR: '1' },
          });

          // Strip ANSI codes and trim
          const cleaned = stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();

          if (!cleaned) {
            errors.push(`${tier.name}: empty response`);
            continue;
          }

          // Try to extract JSON from the response
          const json = extractJson(cleaned);
          if (json !== null) {
            process.stderr.write(`[noesis:llm] ${tier.name} succeeded\n`);
            return json;
          }

          // If no JSON found, return the raw text (caller may handle it)
          process.stderr.write(`[noesis:llm] ${tier.name} responded (raw text)\n`);
          return cleaned;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${tier.name}: ${msg.slice(0, 100)}`);
          process.stderr.write(`[noesis:llm] ${tier.name} failed: ${msg.slice(0, 100)}\n`);
        }
      }

      throw new Error(`All CLI providers failed:\n${errors.join('\n')}`);
    },
  };
}

/**
 * Extract the first JSON object or array from a string.
 * Handles cases where the CLI wraps the response in extra text.
 */
function extractJson(text: string): string | null {
  // Try direct parse first
  try {
    JSON.parse(text);
    return text;
  } catch {
    // continue
  }

  // Look for JSON object or array boundaries
  const starts = [text.indexOf('{'), text.indexOf('[')].filter(i => i !== -1);
  if (starts.length === 0) return null;

  const start = Math.min(...starts);
  const isObject = text[start] === '{';
  const closeChar = isObject ? '}' : ']';

  // Find the matching close bracket
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === (isObject ? '{' : '[')) depth++;
    else if (text[i] === closeChar) depth--;
    if (depth === 0) {
      const candidate = text.slice(start, i + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        return null;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// API-key providers (unchanged — final fallback)
// ---------------------------------------------------------------------------

function createAnthropicProvider(apiKey: string, model: string): LlmProvider {
  return {
    async generate(prompt: string, schema: Record<string, unknown>): Promise<string> {
      const body = {
        model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nRespond with ONLY valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`,
          },
        ],
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${text.slice(0, 200)}`);
      }

      const result = await response.json() as {
        content: Array<{ type: string; text?: string }>;
      };

      const textBlock = result.content?.find(b => b.type === 'text');
      if (!textBlock?.text) {
        throw new Error('Anthropic API returned no text content');
      }

      return textBlock.text;
    },
  };
}

function createOpenAIProvider(apiKey: string, model: string): LlmProvider {
  return {
    async generate(prompt: string, schema: Record<string, unknown>): Promise<string> {
      const body = {
        model,
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: `Respond with ONLY valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${text.slice(0, 200)}`);
      }

      const result = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI API returned no content');
      }

      return content;
    },
  };
}

// ---------------------------------------------------------------------------
// Main factory — CLI-first with API-key fallback
// ---------------------------------------------------------------------------

/**
 * Create an LlmProvider using layered fallback:
 *   1. CLI agents (claude → opencode → kilocode)
 *   2. API key (Anthropic / OpenAI) if configured
 *
 * CLI detection is lazy — happens on first generate() call so it doesn't
 * delay daemon startup.
 *
 * Always returns an LlmProvider (never null). It will throw at generate()
 * time if no provider is available.
 */
export function createLlmProviderAsync(_config: LlmAdapterConfig): LlmProvider {
  let resolved: LlmProvider | null = null;
  let resolving: Promise<LlmProvider | null> | null = null;

  const resolveProvider = async (): Promise<LlmProvider | null> => {
    // Detect CLI providers
    const cliTiers = await detectAvailableClis();
    const apiKey = process.env[_config.apiKeyEnv];

    if (cliTiers.length > 0) {
      process.stderr.write(
        `[noesis:llm] CLI providers available: ${cliTiers.map(t => t.name).join(', ')}\n`,
      );

      const cliProvider = createCliProvider(cliTiers);

      // If API key also available, create a combined provider that falls through
      if (apiKey) {
        const apiProvider = _config.provider === 'openai'
          ? createOpenAIProvider(apiKey, _config.model)
          : createAnthropicProvider(apiKey, _config.model);

        return {
          async generate(prompt: string, schema: Record<string, unknown>): Promise<string> {
            try {
              return await cliProvider.generate(prompt, schema);
            } catch {
              process.stderr.write('[noesis:llm] All CLI providers failed, falling back to API key\n');
              return apiProvider.generate(prompt, schema);
            }
          },
        };
      }

      return cliProvider;
    }

    // No CLI providers — try API key
    if (apiKey) {
      process.stderr.write(`[noesis:llm] No CLI providers found, using API key (${_config.provider})\n`);
      if (_config.provider === 'openai') return createOpenAIProvider(apiKey, _config.model);
      return createAnthropicProvider(apiKey, _config.model);
    }

    return null;
  };

  return {
    async generate(prompt: string, schema: Record<string, unknown>): Promise<string> {
      if (!resolved) {
        if (!resolving) {
          resolving = resolveProvider();
        }
        resolved = await resolving;
        if (!resolved) {
          throw new Error(
            'No LLM providers available — install claude, opencode, or kilocode CLI, or set an API key',
          );
        }
      }
      return resolved.generate(prompt, schema);
    },
  };
}

/**
 * Synchronous factory — backward compatible.
 * Only checks API key (CLI detection is async).
 * Prefer createLlmProviderAsync() for full CLI fallback support.
 */
export function createLlmProvider(config: LlmAdapterConfig): LlmProvider | null {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    // Don't log here — the async path handles this
    return null;
  }

  if (config.provider === 'openai') return createOpenAIProvider(apiKey, config.model);
  return createAnthropicProvider(apiKey, config.model);
}
