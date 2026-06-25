/**
 * Batch receipt importer (seed pass).
 *
 * Reads a folder of receipt images, OCRs each, parses it with the AI bridge,
 * ties it to a store (matched or newly created from the printed location), and
 * ingests it as: (1) an anonymized receipt "data point" for the store directory,
 * and (2) price rows so the planner/deals get real data.
 *
 * Anonymized: receipts are attributed to a single system "community" user and
 * the source image is NOT stored.
 *
 * Usage (run from the deployed app directory so ecosystem.config.cjs is found):
 *   npx tsx server/scripts/import-receipts.ts /path/to/folder
 */

import { readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { createRequire } from "module";
import { spawn } from "child_process";
import { eq } from "drizzle-orm";

/**
 * Top-tier merchant fallback: Codex VISION on the receipt image. Reads the logo
 * and header pixels, so it recovers merchants that OCR garbles (e.g. a Costco or
 * Safeway logo OCR'd to noise). Enabled with CODEX_MERCHANT_VISION=1 and only
 * works where the `codex` CLI is installed/authed (WSL host, not the VM). Returns
 * null on any failure so the caller falls back to the text (Claude bridge) tier.
 */
function codexMerchant(imagePath: string): Promise<string | null> {
  if (process.env.CODEX_MERCHANT_VISION !== "1") return Promise.resolve(null);
  const prompt = "What store or merchant issued this receipt? Reply with ONLY the merchant name plus store number and city if visible, or the single word UNKNOWN.";
  return new Promise((resolve) => {
    const proc = spawn("codex", ["exec", "--skip-git-repo-check", "-i", imagePath], {
      stdio: ["pipe", "pipe", "pipe"], timeout: 120_000,
    });
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("error", () => resolve(null));
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.on("close", () => {
      // Strip CLI noise + token-count lines; the merchant is the last real line.
      const lines = out.split("\n").map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
        .filter((l) => l && !/^(codex|rollout|thread|Reading prompt|warning:|tokens used|\[)/i.test(l) && !/^[\d,]+$/.test(l) && !/ERROR:/.test(l));
      const ans = lines[lines.length - 1] || "";
      if (!ans || ans.length > 80 || /^unknown$/i.test(ans)) return resolve(null);
      resolve(ans);
    });
  });
}

// Load production env from the PM2 ecosystem file if not already set, so this
// script sees DATABASE_URL / CLAUDE_BRIDGE_URL / CLAUDE_BRIDGE_SECRET.
function loadEnvFromEcosystem() {
  if (process.env.DATABASE_URL && process.env.CLAUDE_BRIDGE_URL) return;
  try {
    const require = createRequire(import.meta.url);
    const cfg = require(join(process.cwd(), "ecosystem.config.cjs"));
    const env = (cfg.apps?.[0]?.env ?? cfg.env ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(env)) {
      if (process.env[k] == null) process.env[k] = String(v);
    }
  } catch (e) {
    console.warn("Could not load ecosystem.config.cjs env:", (e as Error).message);
  }
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"]);

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: tsx server/scripts/import-receipts.ts <folder>");
    process.exit(1);
  }
  loadEnvFromEcosystem();

  // Dynamic imports AFTER env is set (db reads DATABASE_URL at module load).
  const { storage } = await import("../storage");
  const { db } = await import("../db");
  const { receipts, prices } = await import("@shared/schema");
  const { ocrImage } = await import("../lib/ocr");
  const { parseReceiptText } = await import("../lib/ai-features");

  const files = readdirSync(dir)
    .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .filter((f) => statSync(join(dir, f)).isFile());
  console.log(`Found ${files.length} image(s) in ${dir}`);

  // Anonymized attribution: one system community user.
  const COMMUNITY_USERNAME = "community-receipts";
  let community = await storage.getUserByUsername(COMMUNITY_USERNAME);
  if (!community) {
    community = await storage.createUser({
      username: COMMUNITY_USERNAME,
      password: "x", // unusable; this account is never logged into
      email: undefined,
      displayName: "Community",
    } as never);
    console.log("Created community user");
  }

  const allStores = await storage.getAllStores();
  const summary = { ok: 0, noText: 0, noItems: 0, failed: 0, prices: 0, storesCreated: 0, dup: 0 };

  // Idempotency guard: skip a parse that matches an existing community receipt
  // (same store + date + item count), so re-runs don't duplicate.
  const existing = await db.select({
    storeName: receipts.storeName, purchaseDate: receipts.purchaseDate, parsedItems: receipts.parsedItems,
  }).from(receipts).where(eq(receipts.userId, community.id));
  const seenKeys = new Set(
    existing.map((r) => `${(r.storeName || "").toLowerCase()}|${r.purchaseDate ? new Date(r.purchaseDate).toISOString().slice(0, 10) : ""}|${Array.isArray(r.parsedItems) ? r.parsedItems.length : 0}`),
  );

  for (const file of files) {
    const path = join(dir, file);
    try {
      const buf = await readFile(path);
      const text = await ocrImage(buf);
      if (!text || text.length < 8) { summary.noText++; console.log(`  ${file}: no OCR text`); continue; }

      const parsed = await parseReceiptText(text);
      if (parsed.items.length === 0) { summary.noItems++; console.log(`  ${file}: parsed 0 items`); continue; }

      // Top-tier merchant fallback: if OCR + the text pass still didn't get the
      // store, read the image with Codex vision.
      if (!parsed.storeName || !parsed.storeName.trim()) {
        const viaVision = await codexMerchant(path);
        if (viaVision) {
          parsed.storeName = viaVision;
          console.log(`  ${file}: merchant via Codex vision -> ${viaVision}`);
        }
      }

      const dupKey = `${(parsed.storeName || "").toLowerCase()}|${parsed.purchaseDate || ""}|${parsed.items.length}`;
      if (seenKeys.has(dupKey)) { summary.dup++; console.log(`  ${file}: duplicate, skipped`); continue; }
      seenKeys.add(dupKey);

      // Resolve store: match by name, else create from printed name/location.
      let storeId: string | undefined;
      const sName = parsed.storeName?.trim();
      if (sName) {
        const lower = sName.toLowerCase();
        const match = allStores.find(
          (s) => s.name.toLowerCase() === lower || s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase()),
        );
        if (match) {
          storeId = match.id;
        } else {
          // No synchronous geocode here (Nominatim is slow/rate-limited from the
          // VM and was the import bottleneck). Coordinates can be backfilled later.
          const created = await storage.createStore({
            name: sName,
            address: parsed.storeLocation || "Community reported",
            lat: null,
            lng: null,
          });
          allStores.push(created);
          storeId = created.id;
          summary.storesCreated++;
          console.log(`  ${file}: created store "${sName}"`);
        }
      }

      // 1. Anonymized receipt data point (no image stored).
      await db.insert(receipts).values({
        userId: community.id,
        storeId,
        storeName: parsed.storeName,
        storeLocation: parsed.storeLocation,
        purchaseDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : undefined,
        totalAmount: parsed.total != null ? String(parsed.total) : undefined,
        parsedItems: parsed.items,
        status: "processed",
      });

      // 2. Price rows (only when tied to a store) so planner/deals benefit.
      if (storeId) {
        const capturedAt = parsed.purchaseDate ? new Date(parsed.purchaseDate) : new Date();
        const priceRows = [];
        for (const it of parsed.items) {
          if (it.price == null || it.price <= 0) continue; // data point only, no price row
          const item = await storage.findOrCreateItem(it.name, it.unit);
          priceRows.push({
            itemId: item.id,
            storeId,
            price: String(it.price),
            unit: it.unit,
            priceType: "receipt",
            capturedAt,
            isPromotion: it.discount != null,
            originalPrice: it.originalPrice != null ? String(it.originalPrice) : undefined,
            submittedBy: community.id,
            notes: "community receipt",
          });
        }
        if (priceRows.length) {
          await db.insert(prices).values(priceRows);
          summary.prices += priceRows.length;
        }
      }
      summary.ok++;
      console.log(`  ${file}: ${parsed.items.length} items @ ${parsed.storeName || "unknown"} (${parsed.purchaseDate || "no date"})`);
    } catch (e) {
      summary.failed++;
      console.error(`  ${file}: FAILED — ${(e as Error).message}`);
    }
  }

  console.log("\nDone:", JSON.stringify(summary));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
