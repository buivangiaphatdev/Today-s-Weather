import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HISTORY_LIMIT } from "@weather/shared";
import { historyApi } from "../api/account";
import type { SearchHistoryItem as ServerHistoryItem } from "../api/types";
import { useAuth } from "../context/auth-provider";
import { useLocalStorage } from "./use-local-storage";

interface SearchHistoryItem {
  id: string;
  query: string;
  lat: number;
  lon: number;
  name: string;
  country: string;
  state?: string;
  searchedAt: number;
}

type NewSearch = Omit<SearchHistoryItem, "id" | "searchedAt">;

const LOCAL_KEY = ["search-history", "local"];
const SERVER_KEY = ["search-history", "account"];

const fromServer = (items: ServerHistoryItem[]): SearchHistoryItem[] =>
  items.map((item) => ({
    ...item,
    state: item.state ?? undefined,
    searchedAt: Date.parse(item.searchedAt),
  }));

// Signed out: this device's localStorage. Signed in: the account (synced across devices).
export function useSearchHistory() {
  const { status } = useAuth();
  const onAccount = status === "signed-in";
  const [history, setHistory] = useLocalStorage<SearchHistoryItem[]>("search-history", []);
  const queryClient = useQueryClient();

  const historyQuery = useQuery({
    queryKey: onAccount ? SERVER_KEY : LOCAL_KEY,
    queryFn: onAccount ? async () => fromServer(await historyApi.list()) : () => history,
    initialData: onAccount ? undefined : history,
    enabled: status !== "loading",
  });

  const addToHistory = useMutation({
    mutationFn: async (search: NewSearch) => {
      if (onAccount) return fromServer(await historyApi.add(search));

      // Remove duplicates and keep only the latest searches
      const filtered = history.filter(
        (item) => !(item.lat === search.lat && item.lon === search.lon),
      );
      const next = [
        { ...search, id: `${search.lat}-${search.lon}-${Date.now()}`, searchedAt: Date.now() },
        ...filtered,
      ].slice(0, HISTORY_LIMIT);
      setHistory(next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(onAccount ? SERVER_KEY : LOCAL_KEY, next);
    },
  });

  const clearHistory = useMutation({
    mutationFn: async () => {
      if (onAccount) await historyApi.clear();
      else setHistory([]);
      return [];
    },
    onSuccess: () => {
      queryClient.setQueryData(onAccount ? SERVER_KEY : LOCAL_KEY, []);
    },
  });

  return {
    history: historyQuery.data ?? [],
    addToHistory,
    clearHistory,
  };
}
