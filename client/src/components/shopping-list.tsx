import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Upload, Plus, List, TrendingUp } from "lucide-react";
import { ShoppingListItem } from "@/lib/types";
import PriceSparkline from "./price-sparkline";

interface ShoppingListProps {
  items: ShoppingListItem[];
  onItemsChange: (items: ShoppingListItem[]) => void;
}

export default function ShoppingList({ items, onItemsChange }: ShoppingListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [bulkItems, setBulkItems] = useState("");

  // Fetch items from database to get IDs for price history
  const { data: dbItems } = useQuery({
    queryKey: ['/api/items'],
    queryFn: async () => {
      const response = await fetch('/api/items');
      if (!response.ok) throw new Error('Failed to fetch items');
      return response.json();
    }
  });

  const getItemId = (itemName: string) => {
    if (!dbItems) return null;
    const dbItem = dbItems.find((item: any) => 
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
            <div className="space-y-3" data-testid="shopping-list-items">
              {items.map((item) => {
                const itemId = getItemId(item.name);
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-muted rounded-md"
                    data-testid={`item-${item.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="text-destructive hover:text-destructive/80 h-6 w-6 p-0"
                        data-testid={`button-remove-${item.id}`}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                    
                    {itemId ? (
                      <div className="flex items-center space-x-2">
                        <TrendingUp size={12} className="text-muted-foreground" />
                        <PriceSparkline
                          itemId={itemId}
                          itemName={item.name}
                          className="flex-1"
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground flex items-center">
                        <TrendingUp size={12} className="mr-1 opacity-50" />
                        <span>Price history not available</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
