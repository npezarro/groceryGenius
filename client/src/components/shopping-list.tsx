import { useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Reorder, useDragControls } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Upload, Plus, List, TrendingUp, GripVertical, Check, Trash2, ChevronDown, ChevronUp, LayoutGrid, LayoutList, Apple, Milk, Beef, Croissant, Snowflake, Package, Cookie, Coffee, UtensilsCrossed, Home, Heart } from "lucide-react";
import { ShoppingListItem } from "@/lib/types";
import { apiUrl } from "@/lib/api";
import { matchItemId, parseCsvItems, parseBulkItems, groupItemsByCategory } from "@/lib/shopping-utils";

const PriceSparkline = lazy(() => import("./price-sparkline"));
const PriceComparison = lazy(() => import("./price-comparison"));

interface ShoppingListProps {
  items: ShoppingListItem[];
  onItemsChange: (items: ShoppingListItem[]) => void;
  userHasMembership?: boolean;
}

function DraggableItem({
  item,
  itemId,
  onRemove,
  onToggleCheck,
  userHasMembership,
}: {
  item: ShoppingListItem;
  itemId: string | null;
  onRemove: (id: string) => void;
  onToggleCheck: (id: string) => void;
  userHasMembership: boolean;
}) {
  const controls = useDragControls();
  const isChecked = item.checked ?? false;
  const [showComparison, setShowComparison] = useState(false);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className={`p-3 rounded-md cursor-default transition-opacity ${isChecked ? "bg-muted/50 opacity-60" : "bg-muted"}`}
      whileDrag={{
        scale: 1.03,
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15), 0 4px 6px -2px rgba(0,0,0,0.08)",
        zIndex: 50,
      }}
      data-testid={`item-${item.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            role="button"
            tabIndex={0}
            aria-label={`Drag to reorder ${item.name}`}
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
          >
            <GripVertical size={16} />
          </div>
          <button
            onClick={() => onToggleCheck(item.id)}
            className={`flex items-center justify-center h-5 w-5 rounded border transition-colors ${
              isChecked
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border hover:border-primary"
            }`}
            aria-label={`Mark ${item.name} as ${isChecked ? "unchecked" : "checked"}`}
          >
            {isChecked && <Check size={12} />}
          </button>
          <span className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : ""}`}>
            {item.name}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRemove(item.id)}
          className="text-destructive hover:text-destructive/80 h-6 w-6 p-0"
          aria-label={`Remove ${item.name}`}
          data-testid={`button-remove-${item.id}`}
        >
          <X size={14} />
        </Button>
      </div>

      {!isChecked && itemId ? (
        <>
          <div className="flex items-center space-x-2">
            <TrendingUp size={12} className="text-muted-foreground" />
            <Suspense fallback={
              <div className="flex items-center space-x-2 flex-1">
                <Skeleton className="w-16 h-8 rounded" />
                <Skeleton className="w-12 h-4 rounded" />
              </div>
            }>
              <PriceSparkline
                itemId={itemId}
                itemName={item.name}
                className="flex-1"
                userHasMembership={userHasMembership}
              />
            </Suspense>
          </div>
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors"
            aria-expanded={showComparison}
            aria-label={`Compare prices for ${item.name}`}
          >
            {showComparison ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Compare prices
          </button>
          {showComparison && (
            <Suspense fallback={<Skeleton className="h-20 w-full mt-1" />}>
              <PriceComparison itemId={itemId} itemName={item.name} />
            </Suspense>
          )}
        </>
      ) : !isChecked ? (
        <div className="text-xs text-muted-foreground flex items-center">
          <TrendingUp size={12} className="mr-1 opacity-50" />
          <span>Price history not available</span>
        </div>
      ) : null}
    </Reorder.Item>
  );
}

function StaticItem({
  item,
  itemId,
  onRemove,
  onToggleCheck,
  userHasMembership,
}: {
  item: ShoppingListItem;
  itemId: string | null;
  onRemove: (id: string) => void;
  onToggleCheck: (id: string) => void;
  userHasMembership: boolean;
}) {
  const isChecked = item.checked ?? false;
  const [showComparison, setShowComparison] = useState(false);

  return (
    <div
      className={`p-3 rounded-md transition-opacity ${isChecked ? "bg-muted/50 opacity-60" : "bg-muted"}`}
      data-testid={`item-${item.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleCheck(item.id)}
            className={`flex items-center justify-center h-5 w-5 rounded border transition-colors ${
              isChecked
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border hover:border-primary"
            }`}
            aria-label={`Mark ${item.name} as ${isChecked ? "unchecked" : "checked"}`}
          >
            {isChecked && <Check size={12} />}
          </button>
          <span className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : ""}`}>
            {item.name}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRemove(item.id)}
          className="text-destructive hover:text-destructive/80 h-6 w-6 p-0"
          aria-label={`Remove ${item.name}`}
        >
          <X size={14} />
        </Button>
      </div>

      {!isChecked && itemId ? (
        <>
          <div className="flex items-center space-x-2">
            <TrendingUp size={12} className="text-muted-foreground" />
            <Suspense fallback={
              <div className="flex items-center space-x-2 flex-1">
                <Skeleton className="w-16 h-8 rounded" />
                <Skeleton className="w-12 h-4 rounded" />
              </div>
            }>
              <PriceSparkline
                itemId={itemId}
                itemName={item.name}
                className="flex-1"
                userHasMembership={userHasMembership}
              />
            </Suspense>
          </div>
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1 transition-colors"
            aria-expanded={showComparison}
            aria-label={`Compare prices for ${item.name}`}
          >
            {showComparison ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Compare prices
          </button>
          {showComparison && (
            <Suspense fallback={<Skeleton className="h-20 w-full mt-1" />}>
              <PriceComparison itemId={itemId} itemName={item.name} />
            </Suspense>
          )}
        </>
      ) : !isChecked ? (
        <div className="text-xs text-muted-foreground flex items-center">
          <TrendingUp size={12} className="mr-1 opacity-50" />
          <span>Price history not available</span>
        </div>
      ) : null}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Produce": Apple,
  "Dairy & Eggs": Milk,
  "Meat & Seafood": Beef,
  "Bakery & Bread": Croissant,
  "Frozen": Snowflake,
  "Pantry": Package,
  "Snacks": Cookie,
  "Beverages": Coffee,
  "Deli": UtensilsCrossed,
  "Household": Home,
  "Personal Care": Heart,
  "Other": List,
};

export default function ShoppingList({ items, onItemsChange, userHasMembership = false }: ShoppingListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [bulkItems, setBulkItems] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [groupByAisle, setGroupByAisle] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch items from database to get IDs for price history
  const { data: dbItems } = useQuery({
    queryKey: ['/api/items'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/items'));
      if (!response.ok) throw new Error('Failed to fetch items');
      return response.json();
    }
  });

  const suggestions = useMemo(() => {
    if (!showSuggestions || newItemName.length < 2 || !dbItems) return [];
    const query = newItemName.toLowerCase();
    return (dbItems as Array<{ id: string; name: string }>)
      .filter(item =>
        item.name.toLowerCase().includes(query) &&
        !items.some(existing => existing.name.toLowerCase() === item.name.toLowerCase())
      )
      .slice(0, 8);
  }, [showSuggestions, newItemName, dbItems, items]);

  const addItem = () => {
    if (newItemName.trim()) {
      const newItem: ShoppingListItem = {
        id: Date.now().toString(),
        name: newItemName.trim()
      };
      onItemsChange([...items, newItem]);
      setNewItemName("");
    }
  };

  const selectSuggestion = useCallback((name: string) => {
    const newItem: ShoppingListItem = {
      id: Date.now().toString(),
      name,
    };
    onItemsChange([...items, newItem]);
    setNewItemName("");
    setShowSuggestions(false);
    setActiveIndex(-1);
  }, [items, onItemsChange]);

  const removeItem = (id: string) => {
    onItemsChange(items.filter(item => item.id !== id));
  };

  const toggleCheck = (id: string) => {
    const updated = items.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    // Sort: unchecked first, checked last, preserving order within each group
    const unchecked = updated.filter(i => !i.checked);
    const checked = updated.filter(i => i.checked);
    onItemsChange([...unchecked, ...checked]);
  };

  const clearChecked = () => {
    onItemsChange(items.filter(item => !item.checked));
  };

  const checkedCount = items.filter(i => i.checked).length;

  const addBulkItems = () => {
    if (bulkItems.trim()) {
      onItemsChange([...items, ...parseBulkItems(bulkItems)]);
      setBulkItems("");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "text/csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target?.result as string;
        if (csvText) {
          onItemsChange([...items, ...parseCsvItems(csvText)]);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <List className="text-primary mr-2" size={20} />
          Shopping List
        </h2>
        
        {/* CSV Upload */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Upload CSV or paste items
          </label>
          <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
              data-testid="input-csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="mx-auto text-2xl text-muted-foreground mb-2" size={32} />
              <p className="text-sm text-muted-foreground">
                Drop CSV file here or <span className="text-primary">browse</span>
              </p>
            </label>
          </div>
        </div>

        {/* Item Input with Autocomplete */}
        <div className="mb-4">
          <div className="relative">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Add item (e.g., organic bananas, milk...)"
              value={newItemName}
              onChange={(e) => {
                setNewItemName(e.target.value);
                setShowSuggestions(e.target.value.length >= 2);
                setActiveIndex(-1);
              }}
              onKeyDown={(e) => {
                if (suggestions.length > 0 && showSuggestions) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIndex >= 0) {
                      selectSuggestion(suggestions[activeIndex].name);
                    } else {
                      addItem();
                      setShowSuggestions(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                    setActiveIndex(-1);
                  }
                } else {
                  if (e.key === 'Enter') { addItem(); setShowSuggestions(false); }
                  if (e.key === 'Escape') setShowSuggestions(false);
                }
              }}
              onFocus={() => setShowSuggestions(newItemName.length >= 2)}
              onBlur={() => setTimeout(() => { setShowSuggestions(false); setActiveIndex(-1); }, 200)}
              className="pr-10"
              data-testid="input-new-item"
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-controls="item-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? `suggestion-${suggestions[activeIndex]?.id}` : undefined}
            />
            <Button
              size="sm"
              onClick={() => { addItem(); setShowSuggestions(false); }}
              className="absolute right-2 top-2 h-6 w-6 p-0"
              aria-label="Add item"
              data-testid="button-add-item"
            >
              <Plus size={14} />
            </Button>

            {/* Autocomplete suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <ul
                id="item-suggestions"
                role="listbox"
                aria-label="Item suggestions"
                className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
              >
                {suggestions.map((suggestion, index) => (
                  <li
                    key={suggestion.id}
                    id={`suggestion-${suggestion.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg cursor-default ${
                      index === activeIndex ? "bg-muted" : "hover:bg-muted"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(suggestion.name);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {suggestion.name}
                  </li>
                ))}
              </ul>
            )}
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {showSuggestions && suggestions.length > 0
                ? `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""} available`
                : ""}
            </div>
          </div>
        </div>

        {/* Textarea for bulk paste */}
        <Textarea
          placeholder="Or paste multiple items (one per line)&#10;Apples&#10;Bread&#10;Milk&#10;Chicken breast"
          value={bulkItems}
          onChange={(e) => setBulkItems(e.target.value)}
          className="h-24 resize-none text-sm mb-2"
          data-testid="textarea-bulk-items"
        />
        
        {bulkItems.trim() && (
          <Button
            onClick={addBulkItems}
            size="sm"
            className="mb-4"
            data-testid="button-add-bulk"
          >
            Add Items
          </Button>
        )}

        {/* Current List */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Current List ({items.length} items{checkedCount > 0 ? `, ${checkedCount} checked` : ""})
            </h3>
            <div className="flex items-center gap-1">
              {items.length >= 3 && (
                <Button
                  size="sm"
                  variant={groupByAisle ? "default" : "ghost"}
                  onClick={() => setGroupByAisle(!groupByAisle)}
                  className="text-xs h-7 gap-1"
                  aria-label={groupByAisle ? "Switch to flat list" : "Group by aisle"}
                  aria-pressed={groupByAisle}
                  data-testid="button-group-by-aisle"
                >
                  {groupByAisle ? <LayoutList size={12} /> : <LayoutGrid size={12} />}
                  {groupByAisle ? "Flat list" : "By aisle"}
                </Button>
              )}
              {checkedCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearChecked}
                  className="text-xs text-muted-foreground hover:text-destructive h-7"
                >
                  <Trash2 size={12} className="mr-1" />
                  Clear checked
                </Button>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <List size={48} className="mx-auto mb-2 opacity-50" />
              <p>No items in your shopping list</p>
              <p className="text-sm">Add items above to get started</p>
            </div>
          ) : groupByAisle ? (
            <div className="space-y-4" data-testid="shopping-list-grouped">
              {groupItemsByCategory(items).map(({ category, items: groupItems }) => {
                const Icon = CATEGORY_ICONS[category] || List;
                const groupId = `category-${category.toLowerCase().replace(/\s+/g, "-")}`;
                return (
                  <div key={category} role="group" aria-labelledby={groupId}>
                    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-border">
                      <Icon size={14} className="text-primary" aria-hidden="true" />
                      <span id={groupId} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {category}
                      </span>
                      <span className="text-xs text-muted-foreground/60" aria-label={`${groupItems.length} items`}>
                        ({groupItems.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {groupItems.map((item) => (
                        <StaticItem
                          key={item.id}
                          item={item}
                          itemId={matchItemId(item.name, dbItems)}
                          onRemove={removeItem}
                          onToggleCheck={toggleCheck}
                          userHasMembership={userHasMembership}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={items}
              onReorder={onItemsChange}
              className="space-y-3"
              data-testid="shopping-list-items"
            >
              {items.map((item) => (
                <DraggableItem
                  key={item.id}
                  item={item}
                  itemId={matchItemId(item.name, dbItems)}
                  onRemove={removeItem}
                  onToggleCheck={toggleCheck}
                  userHasMembership={userHasMembership}
                />
              ))}
            </Reorder.Group>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
