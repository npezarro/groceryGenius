import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";
import { apiUrl } from "@/lib/api";
import type { ShoppingListItem, SavedShoppingList } from "@/lib/types";

const LOCAL_STORAGE_KEY = "gg-shopping-list";
const LOCAL_STORAGE_NAME_KEY = "gg-shopping-list-name";
const SAVE_DEBOUNCE_MS = 1000;

interface UseShoppingListsReturn {
  lists: SavedShoppingList[];
  activeListId: string | null;
  activeListName: string;
  items: ShoppingListItem[];
  setItems: (items: ShoppingListItem[]) => void;
  createList: (name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  renameList: (id: string, name: string) => Promise<void>;
  switchList: (id: string) => void;
  isSaving: boolean;
  hasGuestItems: boolean;
  importGuestItems: () => Promise<void>;
  dismissGuestImport: () => void;
}

function getGuestItems(): ShoppingListItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setGuestItems(items: ShoppingListItem[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
}

export function useShoppingLists(): UseShoppingListsReturn {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [guestItems, setGuestItemsState] = useState<ShoppingListItem[]>(getGuestItems);
  const [isSaving, setIsSaving] = useState(false);
  const [guestImportDismissed, setGuestImportDismissed] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch user's lists when logged in
  const { data: serverLists = [] } = useQuery<SavedShoppingList[]>({
    queryKey: ["/api/shopping-lists"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/shopping-lists"), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Auto-select first list or auto-create if user has no lists
  const autoCreatedRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (serverLists.length > 0 && !activeListId) {
      setActiveListId(serverLists[0].id);
    } else if (serverLists.length === 0 && !autoCreatedRef.current) {
      autoCreatedRef.current = true;
      apiRequest("POST", "/api/shopping-lists", { name: "Shopping List", items: [] })
        .then(res => res.json())
        .then((list: SavedShoppingList) => {
          qc.invalidateQueries({ queryKey: ["/api/shopping-lists"] });
          setActiveListId(list.id);
        })
        .catch(() => {}); // Silently fail if auto-create doesn't work
    }
  }, [user, serverLists, activeListId, qc]);

  // Create list mutation
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/shopping-lists", { name, items: [] });
      return res.json() as Promise<SavedShoppingList>;
    },
    onSuccess: (newList) => {
      qc.invalidateQueries({ queryKey: ["/api/shopping-lists"] });
      setActiveListId(newList.id);
    },
  });

  // Update list mutation (for auto-save)
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; items?: ShoppingListItem[] } }) => {
      const res = await apiRequest("PATCH", `/api/shopping-lists/${id}`, data);
      return res.json() as Promise<SavedShoppingList>;
    },
    onSettled: () => setIsSaving(false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/shopping-lists"] });
    },
  });

  // Delete list mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shopping-lists/${id}`);
    },
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ["/api/shopping-lists"] });
      if (activeListId === deletedId) {
        const remaining = serverLists.filter(l => l.id !== deletedId);
        setActiveListId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
  });

  const activeList = user
    ? serverLists.find(l => l.id === activeListId) || null
    : null;

  const items = user
    ? (activeList?.items ?? [])
    : guestItems;

  const activeListName = user
    ? (activeList?.name ?? "Shopping List")
    : (localStorage.getItem(LOCAL_STORAGE_NAME_KEY) || "Shopping List");

  // Debounced save for logged-in users
  const debouncedSave = useCallback((listId: string, newItems: ShoppingListItem[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsSaving(true);
    saveTimerRef.current = setTimeout(() => {
      updateMutation.mutate({ id: listId, data: { items: newItems } });
    }, SAVE_DEBOUNCE_MS);
  }, [updateMutation]);

  const setItems = useCallback((newItems: ShoppingListItem[]) => {
    if (user && activeListId) {
      // Optimistically update the cache
      qc.setQueryData<SavedShoppingList[]>(["/api/shopping-lists"], (old) => {
        if (!old) return old;
        return old.map(l => l.id === activeListId ? { ...l, items: newItems } : l);
      });
      debouncedSave(activeListId, newItems);
    } else {
      setGuestItemsState(newItems);
      setGuestItems(newItems);
    }
  }, [user, activeListId, debouncedSave, qc]);

  const createList = useCallback(async (name: string) => {
    await createMutation.mutateAsync(name);
  }, [createMutation]);

  const deleteList = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  const renameList = useCallback(async (id: string, name: string) => {
    if (user) {
      updateMutation.mutate({ id, data: { name } });
    } else {
      localStorage.setItem(LOCAL_STORAGE_NAME_KEY, name);
    }
  }, [user, updateMutation]);

  const switchList = useCallback((id: string) => {
    setActiveListId(id);
  }, []);

  // Check if guest has items that could be imported
  const hasGuestItems = !!user && !guestImportDismissed && getGuestItems().length > 0;

  const importGuestItems = useCallback(async () => {
    const guestData = getGuestItems();
    if (guestData.length === 0) return;

    if (activeListId) {
      // Merge guest items into active list
      const currentItems = activeList?.items ?? [];
      const merged = [...currentItems, ...guestData];
      updateMutation.mutate({ id: activeListId, data: { items: merged } });
    } else {
      // Create a new list with guest items
      const res = await apiRequest("POST", "/api/shopping-lists", {
        name: "Imported List",
        items: guestData,
      });
      const newList = await res.json() as SavedShoppingList;
      qc.invalidateQueries({ queryKey: ["/api/shopping-lists"] });
      setActiveListId(newList.id);
    }

    // Clear guest storage
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LOCAL_STORAGE_NAME_KEY);
    setGuestItemsState([]);
    setGuestImportDismissed(true);
  }, [activeListId, activeList, updateMutation, qc]);

  const dismissGuestImport = useCallback(() => {
    setGuestImportDismissed(true);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return {
    lists: user ? serverLists : [],
    activeListId,
    activeListName,
    items,
    setItems,
    createList,
    deleteList,
    renameList,
    switchList,
    isSaving,
    hasGuestItems,
    importGuestItems,
    dismissGuestImport,
  };
}
