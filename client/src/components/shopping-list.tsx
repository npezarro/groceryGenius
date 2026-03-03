import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Upload, Plus, List, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { ShoppingListItem } from "@/lib/types";
import { apiUrl } from "@/lib/api";
import PriceSparkline from "./price-sparkline";

interface ShoppingListProps {
  items: ShoppingListItem[];
  onItemsChange: (items: ShoppingListItem[]) => void;
  userHasMembership?: boolean;
}

export default function ShoppingList({ items, onItemsChange, userHasMembership = false }: ShoppingListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [bulkItems, setBulkItems] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);

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
    <Card className="shadow-sm border-0 shadow-md">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-primary/10 rounded-lg p-1.5 mr-2.5">
            <List className="text-primary" size={18} />
          </div>
          Shopping List
          {items.length > 0 && (
            <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </h2>

        {/* Item Input */}
        <div className="mb-3">
          <div className="relative">
            <Input
              type="text"
              placeholder="Add item (e.g., organic bananas, milk...)"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              className="pr-10 h-10"
              data-testid="input-new-item"
            />
            <Button
              size="sm"
              onClick={addItem}
              className="absolute right-1.5 top-1.5 h-7 w-7 p-0 rounded-md"
              data-testid="button-add-item"
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>

        {/* Collapsible Bulk Import */}
        <button
          onClick={() => setShowBulkImport(!showBulkImport)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          {showBulkImport ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <Upload size={12} />
          Bulk import or CSV upload
        </button>

        {showBulkImport && (
          <div className="space-y-2 mb-4 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="border-2 border-dashed border-border rounded-lg p-3 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
                data-testid="input-csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="mx-auto text-muted-foreground mb-1" size={20} />
                <p className="text-xs text-muted-foreground">
                  Drop CSV or <span className="text-primary font-medium">browse</span>
                </p>
              </label>
            </div>

            <Textarea
              placeholder="Or paste items, one per line..."
              value={bulkItems}
              onChange={(e) => setBulkItems(e.target.value)}
              className="h-20 resize-none text-sm"
              data-testid="textarea-bulk-items"
            />

            {bulkItems.trim() && (
              <Button
                onClick={addBulkItems}
                size="sm"
                className="w-full"
                data-testid="button-add-bulk"
              >
                <Plus size={14} className="mr-1" />
                Add Items
              </Button>
            )}
          </div>
        )}

        {/* Current List */}
        <div>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <div className="bg-muted rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-3">
                <List size={24} className="opacity-40" />
              </div>
              <p className="text-sm font-medium">Your list is empty</p>
              <p className="text-xs mt-1">Add items above to get started</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="shopping-list-items">
              {items.map((item) => {
                const itemId = getItemId(item.name);
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-muted/50 rounded-lg border border-border/50 hover:border-border transition-colors"
                    data-testid={`item-${item.id}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">{item.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
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
                          userHasMembership={userHasMembership}
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
