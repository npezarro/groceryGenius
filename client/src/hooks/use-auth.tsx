import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";

interface AuthUser {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  isAdmin?: boolean;
  emailVerified?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (data: { username: string; password: string; email: string; displayName?: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(apiUrl(url), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/auth/me"), { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const loginMut = useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      fetchJson("/api/auth/login", { method: "POST", body: JSON.stringify(creds) }),
    onSuccess: (data) => qc.setQueryData(["/api/auth/me"], data),
  });

  const registerMut = useMutation({
    mutationFn: (data: { username: string; password: string; email: string; displayName?: string }) =>
      fetchJson("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data) => qc.setQueryData(["/api/auth/me"], data),
  });

  const logoutMut = useMutation({
    mutationFn: () => fetchJson("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(["/api/auth/me"], null);
      qc.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const login = useCallback(
    async (username: string, password: string) => loginMut.mutateAsync({ username, password }),
    [loginMut]
  );
  const register = useCallback(
    async (data: { username: string; password: string; email: string; displayName?: string }) =>
      registerMut.mutateAsync(data),
    [registerMut]
  );
  const logout = useCallback(async () => { await logoutMut.mutateAsync(); }, [logoutMut]);

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
