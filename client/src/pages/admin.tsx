import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ShoppingCart, ShieldAlert, ArrowLeft, Database, Upload, MapPin,
  Settings, RefreshCw, Trash2, Users, Beaker, Home, Mail,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { apiUrl } from "@/lib/api";
import type { DataStats } from "@/lib/types";

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary"></div>
      </div>
    );
  }

  // Admin but email not verified
  if (user?.isAdmin && !user?.emailVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="bg-amber-500/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Mail className="h-8 w-8 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Verify Your Email</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Please verify your email address to access admin features.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/verify-email">
                <Button className="gap-2">
                  <Mail size={14} />
                  Verify Email
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="gap-2">
                  <ArrowLeft size={14} />
                  Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Access denied
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="bg-destructive/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Access Denied</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {user
                ? "Your account does not have admin privileges."
                : "You must be signed in as an admin to access this page."}
            </p>
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ArrowLeft size={14} />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminDashboard />;
}

// ─── Dashboard (only rendered for admins) ──────────────────

function AdminDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-800 to-slate-900 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center space-x-3">
              <Link href="/">
                <div className="bg-white/10 rounded-lg p-1.5 hover:bg-white/20 transition-colors cursor-pointer">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
              </Link>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <Settings size={15} className="text-white/60" />
                  Admin Dashboard
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/60">{user?.displayName || user?.username}</span>
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 h-8 text-xs gap-1.5">
                  <Home size={13} />
                  Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatsPanel />
          <SeedPanel />
          <ImportPanel />
          <GeocodingPanel />
          <DataManagementPanel />
          <UsersPanel />
        </div>
      </div>
    </div>
  );
}

// ─── Database Stats ─────────────────────────────────────────

function StatsPanel() {
  const qc = useQueryClient();

  const { data: stats, isLoading } = useQuery<DataStats>({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/stats"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <Card className="shadow-md border-0">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-primary/10 rounded-lg p-1.5 mr-2.5">
            <Database className="text-primary" size={18} />
          </div>
          Database Stats
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => qc.invalidateQueries({ queryKey: ["/api/stats"] })}
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </Button>
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Stores" value={stats?.storeCount ?? "—"} color="primary" />
          <StatCard label="Items" value={stats?.itemCount ?? "—"} color="secondary" />
          <StatCard label="Prices" value={stats?.priceCount ?? "—"} color="accent" />
          <StatCard label="Geocoded" value={stats ? `${stats.geocodedStoreCount}/${stats.storeCount}` : "—"} color="primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/5 border-primary/10 text-primary",
    secondary: "bg-secondary/5 border-secondary/10 text-secondary",
    accent: "bg-accent/5 border-accent/10 text-accent",
  };
  const cls = colorMap[color] || colorMap.primary;
  return (
    <div className={`p-3 rounded-xl border ${cls}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
    </div>
  );
}

// ─── Test Data Seeding ──────────────────────────────────────

function SeedPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  async function seed(mode: string) {
    setLoading(mode);
    try {
      const res = await fetch(apiUrl(`/api/admin/seed?mode=${mode}`), {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Seed failed");
      toast({ title: "Seed complete", description: data.message || `${mode} seeded successfully` });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    } catch (err) {
      toast({ title: "Seed failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="shadow-md border-0">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-amber-500/10 rounded-lg p-1.5 mr-2.5">
            <Beaker className="text-amber-600" size={18} />
          </div>
          Test Data
        </h2>

        <p className="text-xs text-muted-foreground mb-4">
          Load sample stores, items, and prices for testing. Safe to run multiple times — only inserts missing data.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {["stores", "items", "prices", "all"].map((mode) => (
            <Button
              key={mode}
              variant="outline"
              size="sm"
              disabled={loading !== null}
              onClick={() => seed(mode)}
              className="capitalize"
            >
              {loading === mode ? "..." : `Load ${mode}`}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CSV Import ─────────────────────────────────────────────

function ImportPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [storesFile, setStoresFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [pricesFile, setPricesFile] = useState<File | null>(null);

  const importMutation = useMutation({
    mutationFn: async ({ endpoint, csvData }: { endpoint: string; csvData: string }) => {
      const res = await apiRequest("POST", endpoint, { csvData });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Import complete", description: `Imported ${data.imported} records` });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  async function handleImport(file: File | null, endpoint: string) {
    if (!file) return;
    const text = await file.text();
    importMutation.mutate({ endpoint, csvData: text });
  }

  return (
    <Card className="shadow-md border-0">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-secondary/10 rounded-lg p-1.5 mr-2.5">
            <Upload className="text-secondary" size={18} />
          </div>
          CSV Import
        </h2>

        <div className="space-y-3">
          <ImportRow
            label="Stores"
            file={storesFile}
            onFileChange={setStoresFile}
            onImport={() => handleImport(storesFile, "/api/import/stores")}
            isPending={importMutation.isPending}
          />
          <ImportRow
            label="Items"
            file={itemsFile}
            onFileChange={setItemsFile}
            onImport={() => handleImport(itemsFile, "/api/import/items")}
            isPending={importMutation.isPending}
          />
          <ImportRow
            label="Prices"
            file={pricesFile}
            onFileChange={setPricesFile}
            onImport={() => handleImport(pricesFile, "/api/import/prices")}
            isPending={importMutation.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ImportRow({
  label,
  file,
  onFileChange,
  onImport,
  isPending,
}: {
  label: string;
  file: File | null;
  onFileChange: (f: File | null) => void;
  onImport: () => void;
  isPending: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label} CSV</label>
      <div className="flex gap-2">
        <Input
          type="file"
          accept=".csv"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
          className="text-xs h-8 flex-1"
        />
        {file && (
          <Button size="sm" className="h-8 text-xs" onClick={onImport} disabled={isPending}>
            {isPending ? "..." : "Import"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Geocoding ──────────────────────────────────────────────

function GeocodingPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useQuery<DataStats>({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/stats"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const geocodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/geocode-stores", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Geocoding complete", description: data.message });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err) => {
      toast({ title: "Geocoding failed", description: err.message, variant: "destructive" });
    },
  });

  const progress = stats ? (stats.geocodedStoreCount / Math.max(stats.storeCount, 1)) * 100 : 0;

  return (
    <Card className="shadow-md border-0">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-accent/10 rounded-lg p-1.5 mr-2.5">
            <MapPin className="text-accent" size={18} />
          </div>
          Geocoding
        </h2>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Stores with coordinates</span>
              <span className="font-medium">
                {stats ? `${stats.geocodedStoreCount}/${stats.storeCount}` : "—"}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={() => geocodeMutation.mutate()}
            disabled={geocodeMutation.isPending}
          >
            {geocodeMutation.isPending ? "Geocoding..." : "Geocode Missing Stores"}
          </Button>

          <p className="text-xs text-muted-foreground">Uses Mapbox Geocoding API</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Data Management ────────────────────────────────────────

function DataManagementPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);

  const clearMutation = useMutation({
    mutationFn: async (table: string) => {
      const res = await fetch(apiUrl(`/api/admin/clear/${table}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Clear failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Cleared ${confirming}`, description: `Database now has ${data.stats.storeCount} stores, ${data.stats.itemCount} items, ${data.stats.priceCount} prices` });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      setConfirming(null);
    },
    onError: (err) => {
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
      setConfirming(null);
    },
  });

  function handleClear(table: string) {
    if (confirming === table) {
      clearMutation.mutate(table);
    } else {
      setConfirming(table);
      // Auto-reset confirm state after 3s
      setTimeout(() => setConfirming((c) => (c === table ? null : c)), 3000);
    }
  }

  return (
    <Card className="shadow-md border-0">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-destructive/10 rounded-lg p-1.5 mr-2.5">
            <Trash2 className="text-destructive" size={18} />
          </div>
          Data Management
        </h2>

        <p className="text-xs text-muted-foreground mb-4">
          Clear table data. Clearing stores or items also removes dependent price records.
        </p>

        <div className="space-y-2">
          {["prices", "items", "stores"].map((table) => (
            <Button
              key={table}
              variant={confirming === table ? "destructive" : "outline"}
              size="sm"
              className="w-full capitalize"
              onClick={() => handleClear(table)}
              disabled={clearMutation.isPending}
            >
              <Trash2 size={13} className="mr-1.5" />
              {confirming === table ? `Confirm clear ${table}?` : `Clear ${table}`}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Users List ─────────────────────────────────────────────

function UsersPanel() {
  const { data: users, isLoading } = useQuery<Array<{
    id: string;
    username: string;
    email?: string | null;
    displayName?: string | null;
    role?: string | null;
    emailVerified?: boolean;
    createdAt?: string;
  }>>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/admin/users"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <Card className="shadow-md border-0">
      <CardContent className="p-5">
        <h2 className="text-base font-semibold mb-4 flex items-center">
          <div className="bg-blue-500/10 rounded-lg p-1.5 mr-2.5">
            <Users className="text-blue-500" size={18} />
          </div>
          Registered Users
          {users && (
            <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {users.length}
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary/20 border-t-primary mx-auto"></div>
          </div>
        ) : !users || users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No registered users yet.</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg border border-border/50 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.displayName || u.username}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {u.email || u.username}
                    {u.createdAt && ` · ${new Date(u.createdAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {u.emailVerified && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      verified
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    u.role === "admin"
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {u.role || "user"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
