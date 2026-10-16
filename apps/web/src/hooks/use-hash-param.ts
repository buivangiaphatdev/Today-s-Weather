import { useState } from "react";

// Reads a value from the URL fragment (#token=..., #code=..., #error=...) once and
// removes the fragment from the address bar, so one-time secrets from email links do
// not stay in the browser history or get copied with the URL.
export function useHashParam(name: string): string | null {
  const [value] = useState(() => {
    const found = new URLSearchParams(window.location.hash.slice(1)).get(name);
    if (found) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return found;
  });
  return value;
}
