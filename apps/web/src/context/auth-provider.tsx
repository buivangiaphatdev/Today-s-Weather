import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { authApi, settingsApi } from "../api/account";
import { getSession, onSessionChange, refreshSession } from "../api/http";
import type { LoginInput, RegisterInput, Settings, UserProfile } from "../api/types";
import { importLocalFavorites } from "../hooks/use-favorite";

type AuthStatus = "loading" | "signed-in" | "signed-out";

// Signed out, settings live on this device; signed in, in the account (all devices)
const SETTINGS_KEY = "settings";
const DEFAULT_SETTINGS: Settings = { units: "metric", language: "vi", theme: "system" };

function readLocalSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface AuthState {
  status: AuthStatus;
  user: UserProfile | null;
  login: (input: LoginInput) => Promise<UserProfile>;
  register: (input: RegisterInput) => Promise<UserProfile>;
  logout: () => Promise<void>;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

// Without a provider (e.g. in unit tests) everything behaves as signed out
const AuthContext = createContext<AuthState>({
  status: "signed-out",
  user: null,
  login: () => Promise.reject(new Error("AuthProvider missing")),
  register: () => Promise.reject(new Error("AuthProvider missing")),
  logout: () => Promise.resolve(),
  settings: DEFAULT_SETTINGS,
  updateSettings: () => Promise.resolve(),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(getSession() ? "signed-in" : "loading");
  const [user, setUser] = useState<UserProfile | null>(getSession()?.user ?? null);
  const [localSettings, setLocalSettings] = useState<Settings>(readLocalSettings);

  useEffect(() => {
    const unsubscribe = onSessionChange((session) => {
      setUser(session?.user ?? null);
      setStatus(session ? "signed-in" : "signed-out");
      // Favorites/history switch between localStorage and the account: drop cached copies
      void queryClient.invalidateQueries({ queryKey: ["search-history"] });
      if (!session) {
        void queryClient.invalidateQueries({ queryKey: ["favorites"] });
        return;
      }
      // Signed in: move this device's favorites into the account first, then show
      // the merged list. On failure they stay in localStorage and are retried next time.
      importLocalFavorites()
        .then((count) => {
          if (count > 0)
            toast.success(
              `Saved ${count} favorite ${count === 1 ? "city" : "cities"} to your account`,
            );
        })
        .catch(() => toast.error("Could not sync your favorites, will retry next sign-in"))
        .finally(() => void queryClient.invalidateQueries({ queryKey: ["favorites"] }));
    });
    // Restore the session from the refresh cookie (signed-out if there is none)
    if (!getSession()) {
      void refreshSession().then((session) => {
        if (!session) setStatus("signed-out");
      });
    }
    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  const value: AuthState = {
    status,
    user,
    login: async (input) => (await authApi.login(input)).user,
    register: async (input) => (await authApi.register(input)).user,
    logout: () => authApi.logout(),
    settings: user?.settings ?? localSettings,
    updateSettings: async (patch) => {
      if (status === "signed-in") {
        const saved = await settingsApi.update(patch);
        setUser((current) => current && { ...current, settings: saved });
        return;
      }
      const next = { ...localSettings, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      setLocalSettings(next);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
