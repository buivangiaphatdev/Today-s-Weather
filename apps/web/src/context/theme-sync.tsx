import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Settings } from "../api/types";
import { useAuth } from "./auth-provider";
import { useTheme } from "./theme-provider";

type Theme = Settings["theme"];

// Changing the theme applies it on this device and, when signed in, saves it to the
// account so other devices pick it up on their next sign-in
// eslint-disable-next-line react-refresh/only-export-components
export function useThemePreference() {
  const { theme, setTheme } = useTheme();
  const { status, updateSettings } = useAuth();

  return {
    theme,
    setTheme: (next: Theme) => {
      setTheme(next);
      if (status === "signed-in") {
        updateSettings({ theme: next }).catch(() => toast.error("Could not save your theme"));
      }
    },
  };
}

// On sign-in, the account's theme replaces this device's (once per signed-in user)
export function ThemeSync() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const appliedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      appliedForUser.current = null;
      return;
    }
    if (appliedForUser.current !== user.id) {
      appliedForUser.current = user.id;
      setTheme(user.settings.theme);
    }
  }, [user, setTheme]);

  return null;
}
