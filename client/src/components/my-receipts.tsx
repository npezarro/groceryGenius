import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Receipt as ReceiptIcon, Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ParsedItem { name: string; price?: number | null; quantity?: number | null; unit?: string | null }
interface Receipt {
  id: string;
  storeName: string | null;
  storeLocation: string | null;
  purchaseDate: string | null;
  totalAmount: string | null;
  parsedItems: ParsedItem[] | null;
  uploadedAt: string | null;
}

function EditReceipt({ receipt, onDone }: { receipt: Receipt; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [storeName, setStoreName] = useState(receipt.storeName ?? "");
  const [storeLocation, setStoreLocation] = useState(receipt.storeLocation ?? "");
  const [date, setDate] = useState(receipt.purchaseDate ? receipt.purchaseDate.slice(0, 10) : "");
  const [items, setItems] = useState<ParsedItem[]>(receipt.parsedItems ?? []);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        storeName: storeName.trim() || undefined,
        storeLocation: storeLocation.trim() || undefined,
        purchaseDate: date || undefined,
        parsedItems: items
          .filter((i) => i.name.trim())
          .map((i) => ({
            name: i.name.trim(),
            price: i.price != null && !isNaN(Number(i.price)) ? Number(i.price) : undefined,
            quantity: i.quantity != null && !isNaN(Number(i.quantity)) ? Number(i.quantity) : undefined,
            unit: i.unit || undefined,
          })),
      };
      const res = await apiRequest("PUT", `/api/user/receipts/${receipt.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/user/receipts"] });
      qc.invalidateQueries({ queryKey: ["/api/stores/search"] });
      toast({ title: "Receipt updated" });
      onDone();
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const setItem = (idx: number, patch: Partial<ParsedItem>) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-2 pt-2" data-testid="edit-receipt">
      <div className="grid grid-cols-2 gap-2">
        <input className="rounded-lg border border-input bg-background px-2 py-1 text-sm" placeholder="Store name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        <input className="rounded-lg border border-input bg-background px-2 py-1 text-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <input className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm" placeholder="Location (optional)" value={storeLocation} onChange={(e) => setStoreLocation(e.target.value)} />
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-sm" placeholder="Item" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
            <input className="w-20 rounded-lg border border-input bg-background px-2 py-1 text-sm" placeholder="$" type="number" step="0.01" value={it.price ?? ""} onChange={(e) => setItem(i, { price: e.target.value === "" ? null : Number(e.target.value) })} />
            <button aria-label="Remove item" className="text-muted-foreground hover:text-destructive" onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setItems((arr) => [...arr, { name: "", price: null }])}>
          <Plus size={13} className="mr-1" /> Add item
        </Button>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Check size={14} className="mr-1" /> {save.isPending ? "Saving..." : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={onDone}><X size={14} className="mr-1" /> Cancel</Button>
      </div>
    </div>
  );
}

/** A signed-in user's own uploaded receipts, with inline correction. */
export default function MyReceipts() {
  const [editing, setEditing] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["/api/user/receipts"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/user/receipts"), { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load receipts");
      return (await res.json()) as Receipt[];
    },
    staleTime: 30 * 1000,
  });
  const receipts = data ?? [];

  return (
    <div className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm" data-testid="my-receipts">
      <div className="flex items-center gap-2 mb-1">
        <ReceiptIcon size={18} className="text-[#2f5d4d]" />
        <h3 className="text-lg font-serif">My receipts</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Your uploaded receipts. Fix any store name, date, item, or price that came through wrong.</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No receipts yet. Upload one to start tracking prices.</p>
      ) : (
        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
          {receipts.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-background p-3" data-testid="my-receipt">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.storeName || "Unknown store"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString() : "no date"} · {(r.parsedItems?.length ?? 0)} items
                  </p>
                </div>
                {editing !== r.id && (
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setEditing(r.id)}>
                    <Pencil size={13} className="mr-1" /> Edit
                  </Button>
                )}
              </div>
              {editing === r.id ? (
                <EditReceipt receipt={r} onDone={() => setEditing(null)} />
              ) : (
                (r.parsedItems?.length ?? 0) > 0 && (
                  <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {r.parsedItems!.slice(0, 12).map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{it.name}</span>
                        <span className="shrink-0">{it.price != null ? `$${Number(it.price).toFixed(2)}` : "—"}</span>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
