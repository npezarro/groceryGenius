/**
 * Client for the grocerygenius-bridge alt-account Claude CLI.
 *
 * All AI features route through this bridge so prompts (including untrusted
 * meal-plan text) run on the isolated alt account, never the primary one.
 * See ~/repos/grocerygenius-bridge (port 3098).
 *
 * The bridge is text-in / text-out. Prompt construction and JSON parsing live
 * here so the bridge stays a generic transformer.
 */

const BRIDGE_URL = process.env.CLAUDE_BRIDGE_URL || "";
const BRIDGE_SECRET = process.env.CLAUDE_BRIDGE_SECRET || "";
const DEFAULT_TIMEOUT_MS = 120_000;

export type BridgeModel = "haiku" | "sonnet";

export class AIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIUnavailableError";
  }
}

/** Whether the AI bridge is configured in this environment. */
export function aiEnabled(): boolean {
  return Boolean(BRIDGE_URL);
}

/**
 * Send a prompt to the bridge and return the raw text response.
 * Throws AIUnavailableError when the bridge is not configured or unreachable.
 */
export async function callBridge(
  prompt: string,
  model: BridgeModel = "haiku",
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  if (!BRIDGE_URL) {
    throw new AIUnavailableError("AI bridge not configured (CLAUDE_BRIDGE_URL unset)");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${BRIDGE_URL}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BRIDGE_SECRET ? { "x-bridge-secret": BRIDGE_SECRET } : {}),
      },
      body: JSON.stringify({ prompt, model }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      if (resp.status === 429) throw new AIUnavailableError("AI temporarily at capacity");
      throw new AIUnavailableError(`Bridge error ${resp.status}: ${body.slice(0, 200)}`);
    }
    const data = (await resp.json()) as { response?: string; error?: string };
    if (data.error) throw new AIUnavailableError(data.error);
    return (data.response || "").trim();
  } catch (err) {
    if (err instanceof AIUnavailableError) throw err;
    throw new AIUnavailableError(
      err instanceof Error ? `Bridge unreachable: ${err.message}` : "Bridge unreachable",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the first JSON value (object or array) from a model response.
 * Tolerates ```json fences and surrounding prose. Returns null on failure.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  // Strip code fences
  let s = text.replace(/```(?:json)?/gi, "").trim();
  // Find the first balanced JSON object/array
  const start = s.search(/[[{]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Call the bridge and parse a JSON response in one step.
 * Retries once with an explicit "JSON only" nudge if the first parse fails.
 */
export async function callBridgeJson<T = unknown>(
  prompt: string,
  model: BridgeModel = "haiku",
): Promise<T> {
  const first = await callBridge(prompt, model);
  const parsed = extractJson<T>(first);
  if (parsed !== null) return parsed;

  const retry = await callBridge(
    `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON, no prose, no code fences.`,
    model,
  );
  const parsedRetry = extractJson<T>(retry);
  if (parsedRetry !== null) return parsedRetry;

  throw new AIUnavailableError("AI returned unparseable output");
}
