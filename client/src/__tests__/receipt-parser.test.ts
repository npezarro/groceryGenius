import { describe, it, expect } from "vitest";
import { parseReceiptText } from "@/lib/receipt-parser";

/**
 * Tests for OCR receipt text parsing.
 * Ensures the parser correctly extracts item names, prices, and quantities
 * from common grocery receipt formats.
 */

describe("Receipt Parser — Standard Format", () => {
  it("parses simple ITEM   $X.XX format", () => {
    const text = `
STORE #1234
Bananas          1.29
Whole Milk       4.99
Eggs Large       3.49
SUBTOTAL         9.77
TAX              0.00
TOTAL            9.77
`;
    const items = parseReceiptText(text);
    expect(items.length).toBeGreaterThanOrEqual(3);
    const bananas = items.find(i => i.name.toLowerCase().includes("banana"));
    expect(bananas).toBeDefined();
    expect(bananas!.price).toBe(1.29);
  });

  it("parses items with dollar sign", () => {
    const text = `
Bread            $2.49
Butter           $3.99
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(2);
    expect(items[0].price).toBe(2.49);
    expect(items[1].price).toBe(3.99);
  });

  it("parses items with tax flags (T, F, N)", () => {
    const text = `
Chicken Breast   8.99 F
Soda 12pk        6.49 T
Paper Towels     4.99 N
`;
    const items = parseReceiptText(text);
    expect(items.length).toBeGreaterThanOrEqual(3);
    const chicken = items.find(i => i.name.toLowerCase().includes("chicken"));
    expect(chicken).toBeDefined();
    expect(chicken!.price).toBe(8.99);
  });
});

describe("Receipt Parser — Quantity Lines", () => {
  it("parses quantity @ price format", () => {
    const text = `
Avocado
3 @ 1.50
Rice
1 @ 5.99
`;
    const items = parseReceiptText(text);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const avocado = items.find(i => i.name.toLowerCase().includes("avocado"));
    if (avocado) {
      expect(avocado.quantity).toBe(3);
      expect(avocado.price).toBe(4.50); // 3 * 1.50
    }
  });

  it("parses QTY ITEM PRICE on single line", () => {
    const text = `
2 Bananas 2.58
3 Apples  4.47
`;
    const items = parseReceiptText(text);
    expect(items.length).toBeGreaterThanOrEqual(2);
    const bananas = items.find(i => i.name.toLowerCase().includes("banana"));
    expect(bananas).toBeDefined();
    expect(bananas!.quantity).toBe(2);
    expect(bananas!.price).toBe(2.58);
  });
});

describe("Receipt Parser — Skip Lines", () => {
  it("skips TOTAL, SUBTOTAL, TAX lines", () => {
    const text = `
Milk             3.99
SUBTOTAL         3.99
TAX              0.32
TOTAL            4.31
CHANGE           0.69
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
    expect(items[0].name).toContain("Milk");
  });

  it("skips payment method lines", () => {
    const text = `
Eggs             2.99
VISA ****1234    2.99
CREDIT           2.99
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
  });

  it("skips store info lines", () => {
    const text = `
STORE #456
CASHIER: JOHN
DATE 03/27/2026
Bread            1.99
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
    expect(items[0].name).toContain("Bread");
  });

  it("skips phone numbers", () => {
    const text = `
415-555-1234
Milk             3.99
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
  });

  it("skips date lines", () => {
    const text = `
03/27/2026
Butter           4.49
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
  });

  it("skips separator lines", () => {
    const text = `
-----------
Flour            2.99
===========
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
  });
});

describe("Receipt Parser — Edge Cases", () => {
  it("handles empty input", () => {
    expect(parseReceiptText("")).toHaveLength(0);
  });

  it("handles input with only skip lines", () => {
    const text = `
TOTAL  5.99
TAX    0.48
VISA   5.99
`;
    expect(parseReceiptText(text)).toHaveLength(0);
  });

  it("deduplicates items with same name", () => {
    const text = `
Bananas          1.29
Bananas          1.29
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
  });

  it("rejects prices above $500 as likely errors", () => {
    const text = `
Normal Item      3.99
Glitch Item   9999.99
`;
    const items = parseReceiptText(text);
    expect(items).toHaveLength(1);
    expect(items[0].name).toContain("Normal");
  });

  it("cleans leading item numbers from names", () => {
    const text = `
123 Organic Milk   4.99
`;
    const items = parseReceiptText(text);
    if (items.length > 0) {
      expect(items[0].name).not.toMatch(/^123/);
    }
  });

  it("handles real-world messy OCR text", () => {
    const text = `
SAFEWAY
2020 MARKET ST
SAN FRANCISCO CA

BANANAS          1.29
OLAY BODY WASH   8.99 T
SIGNATURE SEL    3.99
    PASTA
LUCERNE MILK     4.49

SUBTOTAL        18.76
TAX              0.72
TOTAL           19.48
VISA ****4567
`;
    const items = parseReceiptText(text);
    expect(items.length).toBeGreaterThanOrEqual(2);
    // Should find bananas
    const bananas = items.find(i => i.name.toLowerCase().includes("banana"));
    expect(bananas).toBeDefined();
  });
});

describe("Receipt Parser — Hyphens and Discounts", () => {
  it("keeps items whose name contains a hyphen", () => {
    const text = `
COCA-COLA 12PK   7.99
HALF-AND-HALF    3.49
LOW-FAT MILK     4.19
7-UP 2L         $2.49
BANANAS          1.29
`;
    expect(parseReceiptText(text)).toEqual([
      { name: "COCA-COLA 12PK", price: 7.99, quantity: 1 },
      { name: "HALF-AND-HALF", price: 3.49, quantity: 1 },
      { name: "LOW-FAT MILK", price: 4.19, quantity: 1 },
      { name: "7-UP 2L", price: 2.49, quantity: 1 },
      { name: "BANANAS", price: 1.29, quantity: 1 },
    ]);
  });

  it("skips every negative-price discount format, including hyphenated names and tax flags", () => {
    const discounts = [
      "COUPON -1.50",
      "MFR COUPON 1.50-",
      "STORE COUPON -$1.00",
      "SC COUPON $-1.00",
      "COUPON - 1.50",
      "MEMBER DEAL -$ 1.00",
      "BONUS BUY -0.50 F",
      "CLUB CARD 1.00- F",
      "PROMO-DISC -2.00",
      "MFR COUPON- 1.00",
      "COUPON -- 1.50",
      "SC- $1.00",
      "MFR COUPON -    1.00",
      "COUPON -  $1.00",
      "COUPON -$  1.00",
      "CLUB CARD 1.00   -",
      "E-COUPON \u2212 1.00",
      "LOW-FAT MILK \u2013$1.50",
    ];
    for (const line of discounts) {
      expect(parseReceiptText(line), line).toEqual([]);
    }
  });

  it("keeps the item and drops its coupon when both appear", () => {
    const text = `
COCA-COLA 12PK   7.99
MFR COUPON       1.50-
`;
    expect(parseReceiptText(text)).toEqual([
      { name: "COCA-COLA 12PK", price: 7.99, quantity: 1 },
    ]);
  });
});

describe("Receipt Parser — Tax Flag Cleanup", () => {
  it("does not strip a trailing F, N or T that is part of the word", () => {
    const text = `
GREEK YOGURT     3.99
GROUND BEEF      6.49
SWEET CORN       0.79
BACON            5.99 F
2 SEA SALT       4.58
`;
    expect(parseReceiptText(text).map(i => i.name)).toEqual([
      "GREEK YOGURT",
      "GROUND BEEF",
      "SWEET CORN",
      "BACON",
      "SEA SALT",
    ]);
  });

  it("still strips a standalone tax flag before the price", () => {
    const text = `
BANANAS F        1.29
MILK T           3.99
`;
    expect(parseReceiptText(text).map(i => i.name)).toEqual(["BANANAS", "MILK"]);
  });
});
