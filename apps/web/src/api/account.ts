import type {
  AuthResponse,
  FavoriteCity,
  FavoriteInput,
  LoginInput,
  RegisterInput,
  SearchHistoryItem,
  HistoryInput,
  Settings,
  UpdateSettingsInput,
} from "./types";
import { apiFetch, authFetch, setSession, toApiError } from "./http";

async function signIn(path: "/login" | "/register", input: LoginInput | RegisterInput) {
  const response = await authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toApiError(response);
  const session = (await response.json()) as AuthResponse;
  setSession(session);
  return session;
}

export const authApi = {
  login: (input: LoginInput) => signIn("/login", input),
  register: (input: RegisterInput) => signIn("/register", input),
  async logout() {
    // Clear locally even if the network call fails: the user asked to sign out
    await authFetch("/logout", { method: "POST" }).catch(() => undefined);
    setSession(null);
  },
};

export const favoritesApi = {
  list: () => apiFetch<FavoriteCity[]>("/favorites"),
  add: (city: FavoriteInput) =>
    apiFetch<FavoriteCity>("/favorites", { method: "POST", body: city }),
  remove: (id: string) => apiFetch<void>(`/favorites/${id}`, { method: "DELETE" }),
  import: (cities: FavoriteInput[]) =>
    apiFetch<FavoriteCity[]>("/favorites/import", { method: "POST", body: cities }),
};

export const historyApi = {
  list: () => apiFetch<SearchHistoryItem[]>("/history"),
  add: (search: HistoryInput) =>
    apiFetch<SearchHistoryItem[]>("/history", { method: "POST", body: search }),
  clear: () => apiFetch<void>("/history", { method: "DELETE" }),
};

export const settingsApi = {
  update: (input: UpdateSettingsInput) =>
    apiFetch<Settings>("/me/settings", { method: "PATCH", body: input }),
};
