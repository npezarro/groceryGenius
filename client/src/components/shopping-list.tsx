import { useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Reorder, useDragControls } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Upload, Plus, List, TrendingUp, GripVertical } from "lucide-react";
import { ShoppingListItem } from "@/lib/types";
import { apiUrl } from "@/lib/api";

const PriceSparkline = lazy(() => import("./price-sparkline"));

interface ShoppingListProps {
  items: ShoppingListItem[];
  onItemsChange: (items: ShoppingListItem[]) => void;
  userHasMembership?: boolean;
}

function DraggableItem({
  item,
  itemId,
  onRemove,
  userHasMembership,
}: {
  item: ShoppingListItem;
  itemId: string | null;
  onRemove: (id: string) => void;
  userHasMembership: boolean;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="p-3 bg-muted rounded-md cursor-default"
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
          <span className="text-sm font-medium">{item.name}</span>
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

      {itemId ? (
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
      ) : (
        <div className="text-xs text-muted-foreground flex items-center">
          <TrendingUp size={12} className="mr-1 opacity-50" />
          <span>Price history not available</span>
        </div>
      )}
    </Reorder.Item>
  );
}

export default function ShoppingList({ items, onItemsChange, userHasMembership = false }: ShoppingListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [bulkItems, setBulkItems] = useState("");

  // Fetch items from database to get IDs for price history
  const { data: dbItems } = useQuery({
    queryKey: ['/api/items'],
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/items'));
      if (!response.ok) throw new Error('Failed to fetch items');
      return response.json();
    }
  });

  const getItemId = (itemName: string) => {
    if (!dbItems) return null;
    const dbItem = dbItems.find((item: { id: string; name: string }) =>
      item.name.toLowerCase() === itemName.toLowerCase() ||
      item.name.toLowerCase().includes(itemName.toLowerCase()) ||
      itemName.toLowerCase().includes(item.name.toLowerCase())
    );
    return dbItem?.id || null;
  };

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

  const removeItem = (id: string) => {
    onItemsChange(items.filter(item => item.id !== id));
  };

  const addBulkItems = () => {
    if (bulkItems.trim()) {
      const newItems = bulkItems
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(name => ({
          id: Date.now().toString() + Math.random(),
          name
        }));
      
      onItemsChange([...items, ...newItems]);
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
          const lines = csvText.split('\n').filter(line => line.trim());
          const newItems = lines.map(line => ({
            id: Date.now().toString() + Math.random(),
            name: line.split(',')[0].trim().replace(/"/g, '')
          })).filter(item => item.name);
          
          onItemsChange([...items, ...newItems]);
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

        {/* Item Input */}
        <div className="mb-4">
          <div className="relative">
            <Input
              type="text"
              placeholder="Add item (e.g., organic bananas, milk...)"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              className="pr-10"
              data-testid="input-new-item"
            />
            <Button
              size="sm"
              onClick={addItem}
              className="absolute right-2 top-2 h-6 w-6 p-0"
              aria-label="Add item"
              data-testid="button-add-item"
            >
              <Plus size={14} />
            </Button>
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
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Current List ({items.length} items)
          </h3>

          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <List size={48} className="mx-auto mb-2 opacity-50" />
              <p>No items in your shopping list</p>
              <p className="text-sm">Add items above to get started</p>
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
                  itemId={getItemId(item.name)}
                  onRemove={removeItem}
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
