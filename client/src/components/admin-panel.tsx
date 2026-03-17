import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Upload, MapPin, Database, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DataStats } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";

export default function AdminPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [storesFile, setStoresFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [pricesFile, setPricesFile] = useState<File | null>(null);

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery<DataStats>({
    queryKey: ['/api/stats'],
  });

  // Import mutations
  const importStoresMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const response = await apiRequest('POST', '/api/import/stores', { csvData });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Stores imported",
        description: `Successfully imported ${data.imported} stores`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setStoresFile(null);
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importItemsMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const response = await apiRequest('POST', '/api/import/items', { csvData });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Items imported",
        description: `Successfully imported ${data.imported} items`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setItemsFile(null);
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importPricesMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const response = await apiRequest('POST', '/api/import/prices', { csvData });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Prices imported",
        description: `Successfully imported ${data.imported} prices`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setPricesFile(null);
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const geocodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/geocode-stores', {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Geocoding complete",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error) => {
      toast({
        title: "Geocoding failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileImport = async (file: File, mutation: { mutate: (data: string) => void }) => {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvData = e.target?.result as string;
      if (csvData) {
        mutation.mutate(csvData);
      }
    };
    reader.readAsText(file);
  };

  const refreshStats = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
  };

  const geocodingProgress = stats ? 
    (stats.geocodedStoreCount / Math.max(stats.storeCount, 1)) * 100 : 0;

  return (
    <Card className="shadow-sm" id="admin">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Settings className="text-primary mr-2" size={20} />
          Admin Panel
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CSV Import Section */}
          <div className="p-4 border border-border rounded-lg">
            <h3 className="font-medium mb-3 flex items-center">
              <Upload className="text-secondary mr-2" size={16} />
              Import Data
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Stores CSV
                </label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setStoresFile(e.target.files?.[0] || null)}
                  className="text-sm"
                  data-testid="input-stores-csv"
                />
                {storesFile && (
                  <Button
                    size="sm"
                    onClick={() => handleFileImport(storesFile, importStoresMutation)}
                    disabled={importStoresMutation.isPending}
                    className="mt-1 w-full"
                    data-testid="button-import-stores"
                  >
                    {importStoresMutation.isPending ? "Importing..." : "Import Stores"}
                  </Button>
                )}
              </div>
              
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Items CSV
                </label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setItemsFile(e.target.files?.[0] || null)}
                  className="text-sm"
                  data-testid="input-items-csv"
                />
                {itemsFile && (
                  <Button
                    size="sm"
                    onClick={() => handleFileImport(itemsFile, importItemsMutation)}
                    disabled={importItemsMutation.isPending}
                    className="mt-1 w-full"
                    data-testid="button-import-items"
                  >
                    {importItemsMutation.isPending ? "Importing..." : "Import Items"}
                  </Button>
                )}
              </div>
              
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  Prices CSV
                </label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setPricesFile(e.target.files?.[0] || null)}
                  className="text-sm"
                  data-testid="input-prices-csv"
                />
                {pricesFile && (
                  <Button
                    size="sm"
                    onClick={() => handleFileImport(pricesFile, importPricesMutation)}
                    disabled={importPricesMutation.isPending}
                    className="mt-1 w-full"
                    data-testid="button-import-prices"
                  >
                    {importPricesMutation.isPending ? "Importing..." : "Import Prices"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Geocoding Section */}
          <div className="p-4 border border-border rounded-lg">
            <h3 className="font-medium mb-3 flex items-center">
              <MapPin className="text-accent mr-2" size={16} />
              Geocoding
            </h3>
            <div className="space-y-3">
              <div className="text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Stores with coordinates:</span>
                  <span className="font-medium" data-testid="geocoded-count">
                    {stats ? `${stats.geocodedStoreCount}/${stats.storeCount}` : "0/0"}
                  </span>
                </div>
                <Progress value={geocodingProgress} className="h-2" />
              </div>
              <Button
                size="sm"
                onClick={() => geocodeMutation.mutate()}
                disabled={geocodeMutation.isPending}
                className="w-full"
                data-testid="button-geocode-stores"
              >
                {geocodeMutation.isPending ? "Geocoding..." : "Geocode Missing Stores"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Uses Mapbox Geocoding API
              </div>
            </div>
          </div>

          {/* Database Stats */}
          <div className="p-4 border border-border rounded-lg">
            <h3 className="font-medium mb-3 flex items-center">
              <Database className="text-primary mr-2" size={16} />
              Database Stats
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stores:</span>
                <span className="font-medium" data-testid="stats-store-count">
                  {statsLoading ? "..." : stats?.storeCount || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items:</span>
                <span className="font-medium" data-testid="stats-item-count">
                  {statsLoading ? "..." : stats?.itemCount || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price Records:</span>
                <span className="font-medium" data-testid="stats-price-count">
                  {statsLoading ? "..." : stats?.priceCount || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated:</span>
                <span className="font-medium text-xs">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>
              <Button
                size="sm"
                onClick={refreshStats}
                disabled={statsLoading}
                className="w-full mt-3"
                data-testid="button-refresh-stats"
              >
                <RefreshCw size={14} className={`mr-1 ${statsLoading ? 'animate-spin' : ''}`} />
                Refresh Stats
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
