import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ShoppingListItem } from "@/lib/types";

interface ParsedItem {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
}

interface AIListBuilderProps {
  items: ShoppingListItem[];
  onItemsChange: (items: ShoppingListItem[]) => void;
}

/**
 * Meal plan / free text -> structured shopping list, via the alt-account bridge.
 * Parsed items are merged into the current list (deduped by name).
 */
export default function AIListBuilder({ items, onItemsChange }: AIListBuilderProps) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[]>([]);

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/meal-plan", { text });
      return (await res.json()) as { items: ParsedItem[] };
    },
    onSuccess: (data) => {
      setParsed(data.items || []);
      if (!data.items?.length) {
        toast({ title: "No items found", description: "Try describing meals or listing groceries.", variant: "destructive" });
      }
    },
    onError: (e: Error) => {
      const msg = /503/.test(e.message) ? "AI is unavailable right now." : e.message;
      toast({ title: "Couldn't build list", description: msg, variant: "destructive" });
    },
  });

  const addAll = () => {
    const existing = new Set(items.map((i) => i.name.toLowerCase()));
    const additions: ShoppingListItem[] = parsed
      .filter((p) => p.name && !existing.has(p.name.toLowerCase()))
      .map((p) => ({
        id: `ai-${p.name}-${Math.random().toString(36).slice(2, 8)}`,
        name: p.name,
        quantity: p.quantity ?? undefined,
        unit: p.unit ?? undefined,
        checked: false,
      }));
    if (additions.length === 0) {
      toast({ title: "Nothing new to add", description: "Those items are already on your list." });
      return;
    }
    onItemsChange([...items, ...additions]);
    toast({ title: "Added to list", description: `${additions.length} item(s) added.` });
    setParsed([]);
    setText("");
  };

  return (
    <div className="rounded-3xl border border-border bg-card/95 p-5 shadow-sm" data-testid="ai-list-builder">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-[#2f5d4d]" />
        <h3 className="text-lg font-serif">Build a list with AI</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Describe your meals or paste recipes, and we'll turn it into a shopping list.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Taco night for 4, a veggie stir fry, and breakfast: eggs and oatmeal"
        className="w-full min-h-[88px] rounded-xl border border-input bg-background p-3 text-sm resize-y"
        maxLength={8000}
        data-testid="ai-list-input"
      />
      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          onClick={() => generate.mutate()}
          disabled={!text.trim() || generate.isPending}
          data-testid="ai-generate-btn"
        >
          <Sparkles size={14} className="mr-1" />
          {generate.isPending ? "Thinking..." : "Generate"}
        </Button>
        {parsed.length > 0 && (
          <Button size="sm" variant="outline" onClick={addAll} data-testid="ai-add-all-btn">
            <Plus size={14} className="mr-1" /> Add {parsed.length} to list
          </Button>
        )}
      </div>

      {parsed.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5" data-testid="ai-parsed-list">
          {parsed.map((p, i) => (
            <li key={i} className="text-sm flex items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5">
              <span>
                {p.name}
                {p.quantity ? <span className="text-muted-foreground"> · {p.quantity}{p.unit ? ` ${p.unit}` : ""}</span> : null}
              </span>
              {p.category ? <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.category}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
