import { ShoppingListItem } from "./types";

/** Find the database item ID by fuzzy matching on name */
export function matchItemId(
  itemName: string,
  dbItems: Array<{ id: string; name: string }> | undefined
): string | null {
  if (!dbItems) return null;
  const dbItem = dbItems.find(
    (item) =>
      item.name.toLowerCase() === itemName.toLowerCase() ||
      item.name.toLowerCase().includes(itemName.toLowerCase()) ||
      itemName.toLowerCase().includes(item.name.toLowerCase())
  );
  return dbItem?.id || null;
}

/** Parse CSV text into shopping list items (takes first column, strips quotes) */
export function parseCsvItems(csvText: string): ShoppingListItem[] {
  const lines = csvText.split("\n").filter((line) => line.trim());
  return lines
    .map((line) => ({
      id: Date.now().toString() + Math.random(),
      name: line.split(",")[0].trim().replace(/"/g, ""),
    }))
    .filter((item) => item.name);
}

/** Parse newline-separated text into shopping list items */
export function parseBulkItems(text: string): ShoppingListItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .map((name) => ({
      id: Date.now().toString() + Math.random(),
      name,
    }));
}

/** Grocery aisle categories with keyword patterns */
const CATEGORY_RULES: Array<{ category: string; keywords: RegExp }> = [
  { category: "Produce", keywords: /\b(apple|banana|orange|lemon|lime|grape|berr|strawberr|blueberr|raspberr|avocado|tomato|potato|onion|garlic|pepper|lettuce|spinach|kale|carrot|celery|broccoli|cauliflower|cucumber|zucchini|squash|corn|pea|bean|mushroom|ginger|herb|basil|cilantro|parsley|mint|mango|melon|watermelon|pineapple|peach|pear|plum|cherry|fig|pomegranate|coconut|salad|arugula|cabbage|radish|beet|asparagus|artichoke|eggplant|jalape|serrano|habanero|fruit|vegetable|veggie|produce)/i },
  { category: "Dairy & Eggs", keywords: /\b(milk|cream|cheese|yogurt|yoghurt|butter|egg|sour cream|cottage|ricotta|mozzarella|cheddar|parmesan|brie|gouda|feta|cream cheese|half.and.half|whipping cream|kefir|ghee)/i },
  { category: "Meat & Seafood", keywords: /\b(chicken|beef|pork|steak|ground|turkey|lamb|bacon|sausage|ham|salami|pepperoni|fish|salmon|tuna|shrimp|prawn|crab|lobster|tilapia|cod|mahi|scallop|clam|mussel|oyster|anchov|sardine|jerky|brisket|rib|wing|thigh|breast|drumstick|filet|mignon)/i },
  { category: "Bakery & Bread", keywords: /\b(bread|bagel|muffin|croissant|roll|bun|tortilla|pita|naan|wrap|baguette|sourdough|cake|pie|donut|doughnut|pastry|scone|brioche|ciabatta|focaccia|flatbread)/i },
  { category: "Frozen", keywords: /\b(frozen|ice cream|popsicle|gelato|sorbet|frozen pizza|frozen meal|frozen dinner|tv dinner|ice pop|waffle|frozen fruit|frozen veggie)/i },
  { category: "Pantry", keywords: /\b(rice|pasta|noodle|spaghetti|penne|macaroni|flour|sugar|salt|oil|olive oil|vinegar|soy sauce|sauce|ketchup|mustard|mayo|mayonnaise|dressing|spice|cumin|paprika|cinnamon|nutmeg|turmeric|oregano|thyme|rosemary|bay leaf|chili powder|curry|stock|broth|bouillon|can|canned|tomato paste|tomato sauce|salsa|jam|jelly|honey|maple syrup|peanut butter|almond butter|nutella|cereal|oat|granola|pancake mix|baking|baking soda|baking powder|yeast|cornstarch|cocoa|chocolate chip|vanilla|extract|lentil|chickpea|quinoa|couscous|barley)/i },
  { category: "Snacks", keywords: /\b(chip|cracker|pretzel|popcorn|nut|almond|cashew|walnut|pecan|pistachio|peanut|trail mix|granola bar|protein bar|cookie|candy|gummy|chocolate|snack|dried fruit|raisin|jerky)/i },
  { category: "Beverages", keywords: /\b(water|juice|soda|pop|cola|coffee|tea|kombucha|lemonade|energy drink|sports drink|gatorade|sparkling|seltzer|beer|wine|liquor|spirits|vodka|whiskey|rum|tequila|gin|champagne|prosecco|cocktail|smoothie|shake)/i },
  { category: "Deli", keywords: /\b(deli|hummus|guacamole|olive|pickle|rotisserie|prepared|pre.?made|cold cut|lunch meat|sliced turkey|sliced ham|sub roll)/i },
  { category: "Household", keywords: /\b(paper towel|toilet paper|tissue|napkin|trash bag|garbage bag|aluminum foil|plastic wrap|zip.?lock|sponge|dish soap|laundry|detergent|bleach|cleaner|disinfectant|wipe|mop|broom|light bulb|battery|candle)/i },
  { category: "Personal Care", keywords: /\b(shampoo|conditioner|soap|body wash|lotion|deodorant|toothpaste|toothbrush|floss|mouthwash|razor|shaving|sunscreen|band.?aid|medicine|vitamin|supplement|ibuprofen|tylenol|allergy)/i },
];

/** Infer a grocery aisle category from an item name */
export function inferCategory(name: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(name)) {
      return rule.category;
    }
  }
  return "Other";
}

/** Group shopping list items by inferred category, preserving order within groups */
export function groupItemsByCategory(
  items: ShoppingListItem[]
): Array<{ category: string; items: ShoppingListItem[] }> {
  const groups = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const cat = inferCategory(item.name);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }
  // Return groups in the order they first appear
  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
}
