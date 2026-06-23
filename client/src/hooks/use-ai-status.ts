import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";

/** Whether the AI bridge is configured server-side (gates AI UI affordances). */
export function useAIStatus(): boolean {
  const { data } = useQuery({
    queryKey: ["/api/ai/status"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/ai/status"));
      if (!res.ok) return { enabled: false };
      return res.json() as Promise<{ enabled: boolean }>;
    },
    staleTime: 5 * 60 * 1000,
  });
  return Boolean(data?.enabled);
}
