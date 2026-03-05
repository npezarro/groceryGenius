import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, Trash2, Send, Receipt, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Store {
  id: string;
  name: string;
}

interface ParsedItem {
  name: string;
  price: number;
  quantity?: number;
  unit?: string;
}

interface ReceiptUploadProps {
  stores: Store[];
}

export default function ReceiptUpload({ stores }: ReceiptUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([{ name: "", price: 0 }]);
  const [showForm, setShowForm] = useState(false);

  const { data: myReceipts = [] } = useQuery<Array<{ id: string; storeName?: string; status: string; uploadedAt: string; parsedItems?: ParsedItem[] }>>({
    queryKey: ["/api/user/receipts"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/user/receipts"), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Resize and convert to base64
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setImagePreview(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const addItem = () => setItems([...items, { name: "", price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ParsedItem, value: string | number) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const uploadReceipt = useMutation({
    mutationFn: async () => {
      const validItems = items.filter((it) => it.name && it.price > 0);
      const res = await fetch(apiUrl("/api/user/receipts"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId || undefined,
          storeName: storeName || stores.find((s) => s.id === storeId)?.name || undefined,
          imageData: imagePreview,
          purchaseDate: purchaseDate || undefined,
          parsedItems: validItems.length > 0 ? validItems : undefined,
        }),
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (receipt) => {
      toast({ title: "Receipt uploaded" });
      qc.invalidateQueries({ queryKey: ["/api/user/receipts"] });
      // Reset form
      setStoreId("");
      setStoreName("");
      setPurchaseDate("");
      setImagePreview(null);
      setItems([{ name: "", price: 0 }]);
      setShowForm(false);
    },
    onError: (err) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const submitPrices = useMutation({
    mutationFn: async (receiptId: string) => {
      const res = await fetch(apiUrl(`/api/user/receipts/${receiptId}/submit-prices`), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to submit prices");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Prices submitted", description: `${data.submitted} prices added to the database` });
      qc.invalidateQueries({ queryKey: ["/api/user/receipts"] });
      qc.invalidateQueries({ queryKey: ["/api/prices"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  if (!user) return null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center">
            <Receipt className="text-secondary mr-2" size={16} />
            Receipts
          </h3>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Upload Receipt"}
          </Button>
        </div>

        {showForm && (
          <div className="space-y-3 border-t pt-3 mb-3">
            <div>
              <Label className="text-xs">Store</Label>
              <select
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
                <Label className="text-xs">Purchase Date</Label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Photo upload */}
            <div>
              <Label className="text-xs">Receipt Photo (optional)</Label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
              {imagePreview ? (
                <div className="relative mt-1">
                  <img src={imagePreview} alt="Receipt" className="w-full rounded border max-h-48 object-contain" />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => setImagePreview(null)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full mt-1 h-8 text-xs" onClick={() => fileRef.current?.click()}>
                  <Camera size={12} className="mr-1" /> Take Photo or Upload
                </Button>
              )}
            </div>

            {/* Items entry */}
            <div>
              <Label className="text-xs">Items & Prices</Label>
              <div className="space-y-1 mt-1">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <Input
                      placeholder="Item name"
                      value={item.name}
                      onChange={(e) => updateItem(i, "name", e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="$"
                      value={item.price || ""}
                      onChange={(e) => updateItem(i, "price", parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs w-20"
                    />
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeItem(i)}>
                        <Trash2 size={10} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={addItem}>
                <Plus size={10} className="mr-1" /> Add item
              </Button>
            </div>

            <Button
              size="sm"
              className="w-full"
              onClick={() => uploadReceipt.mutate()}
              disabled={uploadReceipt.isPending || (!storeId && !storeName)}
            >
              <Upload size={14} className="mr-1" />
              {uploadReceipt.isPending ? "Uploading..." : "Save Receipt"}
            </Button>
          </div>
        )}

        {/* Existing receipts */}
        {myReceipts.length > 0 && (
          <div className="space-y-2">
            {myReceipts.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs border rounded p-2">
                <div>
                  <span className="font-medium">{r.storeName || "Unknown store"}</span>
                  <span className="text-muted-foreground ml-2">
                    {new Date(r.uploadedAt).toLocaleDateString()}
                  </span>
                  <span className={`ml-2 ${r.status === "processed" ? "text-secondary" : "text-accent"}`}>
                    {r.status}
                  </span>
                </div>
                {r.status === "processed" && r.parsedItems && (r.parsedItems as ParsedItem[]).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => submitPrices.mutate(r.id)}
                    disabled={submitPrices.isPending}
                  >
                    <Send size={10} className="mr-1" /> Submit
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
