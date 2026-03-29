import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, Trash2, Send, Receipt, Plus, Scan, Loader2, RotateCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { parseReceiptText, type ParsedReceiptItem } from "@/lib/receipt-parser";

interface Store {
  id: string;
  name: string;
}

interface ReceiptUploadProps {
  stores: Store[];
}

type OcrStatus = "idle" | "loading" | "scanning" | "done" | "error";

export default function ReceiptUpload({ stores }: ReceiptUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedReceiptItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [_rawOcrText, setRawOcrText] = useState("");

  const { data: myReceipts = [] } = useQuery<Array<{ id: string; storeName?: string; status: string; uploadedAt: string; parsedItems?: ParsedReceiptItem[] }>>({
    queryKey: ["/api/user/receipts"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/user/receipts"), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setImagePreview(dataUrl);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const runOcr = async () => {
    if (!imagePreview) return;

    setOcrStatus("loading");
    setOcrProgress(0);

    try {
      // Dynamic import to avoid loading tesseract.js upfront
      const Tesseract = await import("tesseract.js");
      setOcrStatus("scanning");

      const result = await Tesseract.recognize(imagePreview, "eng", {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      const text = result.data.text;
      setRawOcrText(text);

      const parsed = parseReceiptText(text);
      if (parsed.length > 0) {
        setItems(parsed);
        setOcrStatus("done");
        toast({ title: "Receipt scanned", description: `Found ${parsed.length} items. Review and edit below.` });
      } else {
        setOcrStatus("done");
        toast({ title: "No items found", description: "OCR completed but couldn't extract items. Try adding manually.", variant: "destructive" });
      }
    } catch (err) {
      console.error("OCR error:", err);
      setOcrStatus("error");
      toast({ title: "Scan failed", description: "Could not read the receipt image. Try a clearer photo.", variant: "destructive" });
    }
  };

  const addItem = () => setItems([...items, { name: "", price: 0, quantity: 1 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ParsedReceiptItem, value: string | number) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
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
          status: validItems.length > 0 ? "processed" : "pending",
        }),
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (_receipt) => {
      toast({ title: "Receipt saved" });
      qc.invalidateQueries({ queryKey: ["/api/user/receipts"] });
      resetForm();
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
    },
  });

  const resetForm = () => {
    setStoreId("");
    setStoreName("");
    setPurchaseDate("");
    setImagePreview(null);
    setItems([]);
    setShowForm(false);
    setOcrStatus("idle");
    setOcrProgress(0);
    setRawOcrText("");
  };

  if (!user) return null;

  const validItemCount = items.filter(it => it.name && it.price > 0).length;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center">
            <Receipt className="text-secondary mr-2" size={16} />
            Receipt Scanner
          </h3>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
            {showForm ? "Cancel" : "Scan Receipt"}
          </Button>
        </div>

        {showForm && (
          <div className="space-y-3 border-t pt-3 mb-3">
            {/* Store + Date */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="receipt-store" className="text-xs">Store</Label>
                <select
                  id="receipt-store"
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
              <div className="w-36">
                <Label htmlFor="receipt-date" className="text-xs">Date</Label>
                <Input
                  id="receipt-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Photo upload + OCR */}
            <div>
              <Label className="text-xs">Receipt Photo</Label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

              {imagePreview ? (
                <div className="mt-1 space-y-2">
                  <div className="relative">
                    <img src={imagePreview} alt="Receipt" className="w-full rounded border max-h-64 object-contain bg-muted" />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-6 w-6 p-0"
                      onClick={() => { setImagePreview(null); setOcrStatus("idle"); }}
                      aria-label="Remove receipt photo"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>

                  {ocrStatus === "idle" && (
                    <Button size="sm" className="w-full" onClick={runOcr}>
                      <Scan size={14} className="mr-1" /> Scan for Items
                    </Button>
                  )}

                  {(ocrStatus === "loading" || ocrStatus === "scanning") && (
                    <div className="text-center py-2">
                      <Loader2 size={20} className="animate-spin mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">
                        {ocrStatus === "loading" ? "Loading OCR engine..." : `Scanning... ${ocrProgress}%`}
                      </p>
                      {ocrStatus === "scanning" && (
                        <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${ocrProgress}%` }} />
                        </div>
                      )}
                    </div>
                  )}

                  {ocrStatus === "error" && (
                    <Button size="sm" variant="outline" className="w-full" onClick={runOcr}>
                      <RotateCw size={14} className="mr-1" /> Retry Scan
                    </Button>
                  )}

                  {ocrStatus === "done" && items.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-2">
                      <p>No items found automatically.</p>
                      <Button size="sm" variant="ghost" className="mt-1" onClick={addItem}>
                        <Plus size={12} className="mr-1" /> Add manually
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full mt-1 h-8 text-xs" onClick={() => fileRef.current?.click()}>
                  <Camera size={12} className="mr-1" /> Take Photo or Upload
                </Button>
              )}
            </div>

            {/* Extracted/manual items */}
            {items.length > 0 && (
              <div>
                <Label className="text-xs">
                  Items ({validItemCount} valid)
                  {ocrStatus === "done" && <span className="text-muted-foreground ml-1">— review and edit</span>}
                </Label>
                <div className="space-y-1 mt-1 max-h-60 overflow-y-auto">
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
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity || ""}
                        onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)}
                        className="h-7 text-xs w-14"
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeItem(i)} aria-label={`Remove ${item.name || "item"}`}>
                        <Trash2 size={10} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={addItem}>
                  <Plus size={10} className="mr-1" /> Add item
                </Button>
              </div>
            )}

            {/* No image — manual entry only */}
            {!imagePreview && items.length === 0 && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2">Or enter items manually</p>
                <Button variant="ghost" size="sm" onClick={addItem}>
                  <Plus size={12} className="mr-1" /> Add item
                </Button>
              </div>
            )}

            {/* Submit */}
            <Button
              size="sm"
              className="w-full"
              onClick={() => uploadReceipt.mutate()}
              disabled={uploadReceipt.isPending || (!storeId && !storeName) || validItemCount === 0}
            >
              <Upload size={14} className="mr-1" />
              {uploadReceipt.isPending ? "Saving..." : `Save Receipt (${validItemCount} items)`}
            </Button>
          </div>
        )}

        {/* Recent receipts */}
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
                {r.status === "processed" && r.parsedItems && (r.parsedItems as ParsedReceiptItem[]).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => submitPrices.mutate(r.id)}
                    disabled={submitPrices.isPending}
                  >
                    <Send size={10} className="mr-1" /> Submit Prices
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
