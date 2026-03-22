import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, HeartOff, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Store {
  id: string;
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
}

interface FavoriteStoresProps {
  stores: Store[];
}

export default function FavoriteStores({ stores }: FavoriteStoresProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: favorites = [] } = useQuery<Array<{ storeId: string }>>({
    queryKey: ["/api/user/favorite-stores"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/user/favorite-stores"), { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const favSet = new Set(favorites.map((f) => f.storeId));

  const toggle = useMutation({
    mutationFn: async (storeId: string) => {
      const isFav = favSet.has(storeId);
      const method = isFav ? "DELETE" : "POST";
      const res = await fetch(apiUrl(`/api/user/favorite-stores/${storeId}`), {
        method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return { storeId, action: isFav ? "removed" : "added" };
    },
    onSuccess: ({ action }) => {
      qc.invalidateQueries({ queryKey: ["/api/user/favorite-stores"] });
      toast({ title: action === "added" ? "Store favorited" : "Favorite removed" });
    },
  });

  if (!user) return null;
  if (stores.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center">
          <Heart className="text-red-500 mr-2" size={16} />
          Favorite Stores
        </h3>
        <div className="space-y-2">
          {stores.map((store) => (
            <div key={store.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center min-w-0">
                <MapPin size={12} className="text-muted-foreground mr-1 flex-shrink-0" />
                <span className="truncate">{store.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 flex-shrink-0"
                onClick={() => toggle.mutate(store.id)}
                disabled={toggle.isPending}
                aria-label={favSet.has(store.id) ? `Remove ${store.name} from favorites` : `Add ${store.name} to favorites`}
              >
                {favSet.has(store.id) ? (
                  <Heart size={14} className="text-red-500 fill-red-500" />
                ) : (
                  <HeartOff size={14} className="text-muted-foreground" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
