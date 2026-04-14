import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Plus, Trash2, Check, X, Loader2 } from "lucide-react";
import type { SavedShoppingList } from "@/lib/types";

interface ListSelectorProps {
  lists: SavedShoppingList[];
  activeListId: string | null;
  activeListName: string;
  isSaving: boolean;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
}

export default function ListSelector({
  lists,
  activeListId,
  activeListName,
  isSaving,
  onSwitch,
  onCreate,
  onDelete,
  onRename,
}: ListSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [newListName, setNewListName] = useState("");

  const handleStartRename = (list: SavedShoppingList) => {
    setEditingId(list.id);
    setEditName(list.name);
  };

  const handleConfirmRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleCreate = async () => {
    const name = newListName.trim() || "New List";
    await onCreate(name);
    setNewListName("");
    setShowNewInput(false);
    setIsOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (lists.length <= 1) return; // Don't delete the last list
    await onDelete(id);
  };

  if (lists.length === 0) return null;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={isOpen}
          aria-label={`Switch shopping list, current: ${activeListName}`}
        >
          <span className="truncate max-w-[200px]">{activeListName}</span>
          <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isSaving && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Saving...
          </span>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-20 top-8 left-0 w-64 bg-card border border-border rounded-lg shadow-lg p-2 space-y-1" role="listbox" aria-label="Shopping lists">
          {lists.map((list) => (
            <div
              key={list.id}
              className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                list.id === activeListId ? "bg-muted font-medium" : "hover:bg-muted/50"
              }`}
            >
              {editingId === list.id ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-6 text-sm px-1"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleConfirmRename} aria-label="Confirm rename">
                    <Check size={12} />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingId(null)} aria-label="Cancel rename">
                    <X size={12} />
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    className="flex-1 text-left truncate"
                    onClick={() => {
                      onSwitch(list.id);
                      setIsOpen(false);
                    }}
                    onDoubleClick={() => handleStartRename(list)}
                    aria-label={`Switch to ${list.name}`}
                  >
                    {list.name}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {(list.items as unknown[]).length}
                  </span>
                  {lists.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(list.id)}
                      aria-label={`Delete list ${list.name}`}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}

          <div className="border-t border-border pt-1 mt-1">
            {showNewInput ? (
              <div className="flex items-center gap-1 px-2">
                <Input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setShowNewInput(false);
                  }}
                  placeholder="List name..."
                  className="h-6 text-sm px-1"
                  autoFocus
                />
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCreate} aria-label="Confirm new list">
                  <Check size={12} />
                </Button>
              </div>
            ) : (
              <button
                className="flex items-center gap-1.5 w-full px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50"
                onClick={() => setShowNewInput(true)}
              >
                <Plus size={14} />
                New List
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
