import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Store {
  id: string;
  name: string;
}

interface SubmitPriceProps {
  stores: Store[];
}

export default function SubmitPrice({ stores }: SubmitPriceProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [itemName, setItemName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/api/user/prices"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName,
          storeId,
          price: parseFloat(price),
          unit: unit || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit price");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Price submitted", description: `$${price} for ${itemName}` });
      setItemName("");
      setPrice("");
      setUnit("");
      qc.invalidateQueries({ queryKey: ["/api/prices"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err) => {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center">
          <DollarSign className="text-green-600 mr-2" size={16} />
          Submit a Price
        </h3>

        <div className="space-y-3">
          <div>
            <Label htmlFor="sp-item" className="text-xs">Item Name</Label>
            <Input
              id="sp-item"
              placeholder="e.g. Organic Milk"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="sp-store" className="text-xs">Store</Label>
            <select
              id="sp-store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full h-8 text-sm border border-input rounded-md px-2 bg-background"
            >
              <option value="">Select store...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="sp-price" className="text-xs">Price ($)</Label>
              <Input
                id="sp-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="3.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="w-20">
              <Label htmlFor="sp-unit" className="text-xs">Unit</Label>
              <Input
                id="sp-unit"
                placeholder="lb"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <Button
            onClick={() => submit.mutate()}
            disabled={!itemName || !storeId || !price || submit.isPending}
            size="sm"
            className="w-full"
          >
            <Plus size={14} className="mr-1" />
            {submit.isPending ? "Submitting..." : "Submit Price"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
