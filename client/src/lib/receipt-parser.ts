/**
 * Parse raw OCR text from a grocery receipt into structured line items.
 * Handles common receipt formats from major US grocery chains.
 */

export interface ParsedReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

/** Lines to skip — store info, totals, payment, etc. */
const SKIP_PATTERNS = [
  /^(sub)?total/i,
  /^tax/i,
  /^change/i,
  /^cash/i,
  /^credit/i,
  /^debit/i,
  /^visa/i,
  /^master/i,
  /^amex/i,
  /^balance/i,
  /^savings/i,
  /^you saved/i,
  /^thank you/i,
  /^store\s*#/i,
  /^cashier/i,
  /^register/i,
  /^trans(action)?/i,
  /^date/i,
  /^time/i,
  /^tel/i,
  /^phone/i,
  /^www\./i,
  /^http/i,
  /^\d{3}[-.]\d{3}/,  // phone numbers
  /^\d{1,2}\/\d{1,2}\/\d{2,4}/,  // dates
  /^-{3,}/,  // separator lines
  /^={3,}/,
  /^\*{3,}/,
  /^\s*$/,  // empty lines
];

/** Patterns for quantity lines like "2 @ $3.99" */
const QUANTITY_PRICE_PATTERN = /^(\d+)\s*[@x×]\s*\$?([\d.]+)/i;

/** Main item line: NAME followed by PRICE at the end */
const ITEM_PRICE_PATTERN = /^(.+?)\s+\$?([\d]+\.[\d]{2})\s*[A-Z]?\s*$/;

/** Item with quantity prefix: "2 Bananas 1.98" */
const QTY_ITEM_PRICE_PATTERN = /^(\d+)\s+(.+?)\s+\$?([\d]+\.[\d]{2})\s*[A-Z]?\s*$/;

/** Discount/coupon lines (negative prices) */
const DISCOUNT_PATTERN = /^(.+?)\s+-?\$?([\d]+\.[\d]{2})-?\s*$/;

function shouldSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some(pattern => pattern.test(line.trim()));
}

function cleanItemName(name: string): string {
  return name
    .replace(/\s+/g, " ")       // collapse whitespace
    .replace(/^[\d#]+\s+/, "")  // remove leading item numbers
    .replace(/\s*[FNT]$/, "")   // remove tax flags (F=food, N=nontax, T=taxable)
    .trim();
}

export function parseReceiptText(rawText: string): ParsedReceiptItem[] {
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
  const items: ParsedReceiptItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (shouldSkipLine(line)) continue;

    // Check for quantity line "2 @ $3.99"
    const qtyMatch = line.match(QUANTITY_PRICE_PATTERN);
    if (qtyMatch) {
      // Look at the previous line for the item name
      const prevLine = i > 0 ? lines[i - 1].trim() : "";
      if (prevLine && !shouldSkipLine(prevLine)) {
        const name = cleanItemName(prevLine);
        const qty = parseInt(qtyMatch[1]);
        const unitPrice = parseFloat(qtyMatch[2]);
        if (name && unitPrice > 0) {
          const key = name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            items.push({ name, price: unitPrice * qty, quantity: qty });
          }
        }
      }
      continue;
    }

    // Check for quantity+item+price on same line "2 Bananas 1.98"
    const qtyItemMatch = line.match(QTY_ITEM_PRICE_PATTERN);
    if (qtyItemMatch) {
      const qty = parseInt(qtyItemMatch[1]);
      const name = cleanItemName(qtyItemMatch[2]);
      const price = parseFloat(qtyItemMatch[3]);
      if (name && price > 0 && qty > 0) {
        const key = name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ name, price, quantity: qty });
        }
      }
      continue;
    }

    // Skip discount lines
    if (DISCOUNT_PATTERN.test(line) && line.includes("-")) continue;

    // Standard: ITEM_NAME    $X.XX
    const itemMatch = line.match(ITEM_PRICE_PATTERN);
    if (itemMatch) {
      const name = cleanItemName(itemMatch[1]);
      const price = parseFloat(itemMatch[2]);
      if (name && price > 0 && price < 500) { // Sanity check on price
        const key = name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ name, price, quantity: 1 });
        }
      }
    }
  }

  return items;
}
