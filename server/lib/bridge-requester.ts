/**
 * Who a bridge job is for. The bridge runs the owner's jobs on the owner's Claude
 * subscription and everyone else's on the Claude API credits (public-api-engine.js in the
 * bridge), and stops public jobs when those credits run out. The app is the only party
 * that knows the signed-in user, so it decides here and sends the answer as the
 * X-Bridge-Requester header next to the bridge secret.
 *
 * SHARED across the bridge-backed apps (verbatim except the OWNER_EMAILS default below).
 */
export type BridgeRequester = "owner" | "public";

// PUBLIC REPO deviation from the shared copy: no hardcoded default (the owner's address
// must not be committed here). OWNER_EMAILS must be set in the deployed env; unset, every
// user is public, which fails safe (owner jobs bill the API credits, never the reverse).
const OWNER_EMAILS = (process.env.OWNER_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function requesterFor(email: string | null | undefined): BridgeRequester {
  return email && OWNER_EMAILS.includes(email.trim().toLowerCase()) ? "owner" : "public";
}

/** Shown when the bridge answers 402: public access is paused until the credits refresh. */
export const PUBLIC_PAUSED_MESSAGE =
  "Public AI access is paused for now because this month's usage budget is used up. Please check back later.";
