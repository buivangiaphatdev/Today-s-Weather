import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roundCoordinate } from "@weather/shared";
import { favoritesApi } from "../api/account";
import { useAuth } from "../context/auth-provider";

// Same shape whether it comes from localStorage (signed out) or the account (signed in)
export interface FavoriteCity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
  addedAt: number;
}

type NewFavorite = Omit<FavoriteCity, "id" | "addedAt">;

const STORAGE_KEY = "favorites";
const LOCAL_KEY = ["favorites", "local"];
const SERVER_KEY = ["favorites", "account"];

// ---- Signed out: localStorage is the source of truth ---------------------------

function readFavorites(): FavoriteCity[] {
  try {
    const item = window.localStorage.getItem(STORAGE_KEY);
    return item ? JSON.parse(item) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function writeFavorites(favorites: FavoriteCity[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

// First sign-in on a device: move its local favorites into the account. The import
// endpoint skips duplicates, so a retry after a failure is harmless; local data is only
// cleared once the server has it. Returns how many cities were sent.
export async function importLocalFavorites(): Promise<number> {
  const local = readFavorites();
  if (local.length === 0) return 0;
  await favoritesApi.import(
    local.map(({ name, country, state, lat, lon }) => ({ name, country, state, lat, lon })),
  );
  writeFavorites([]);
  return local.length;
}

// ---- Hook ------------------------------------------------------------------------

const sameCoordinates = (a: { lat: number; lon: number }, lat: number, lon: number) =>
  roundCoordinate(a.lat) === roundCoordinate(lat) &&
  roundCoordinate(a.lon) === roundCoordinate(lon);

export function useFavorites() {
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const onAccount = status === "signed-in";
  const queryKey = onAccount ? SERVER_KEY : LOCAL_KEY;

  const favoritesQuery = useQuery({
    queryKey,
    queryFn: onAccount
      ? async (): Promise<FavoriteCity[]> =>
          (await favoritesApi.list()).map((city) => ({
            id: city.id,
            name: city.name,
            lat: city.lat,
            lon: city.lon,
            country: city.country,
            state: city.state ?? undefined,
            addedAt: Date.parse(city.createdAt),
          }))
      : readFavorites,
    initialData: onAccount ? undefined : readFavorites,
    // Local data only changes through the mutations below; account data may change on
    // another device, so it is refetched when stale
    staleTime: onAccount ? 30_000 : Infinity,
    enabled: status !== "loading",
  });

  const addFavorite = useMutation({
    mutationFn: async (city: NewFavorite) => {
      if (onAccount) {
        await favoritesApi.add(city);
        return null;
      }
      const current = readFavorites();
      const id = `${city.lat}-${city.lon}`;
      if (current.some((fav) => fav.id === id)) return current; // no duplicates
      const next = [...current, { ...city, id, addedAt: Date.now() }];
      writeFavorites(next);
      return next;
    },
    onSuccess: (next) => {
      if (next) queryClient.setQueryData(LOCAL_KEY, next);
      else void queryClient.invalidateQueries({ queryKey: SERVER_KEY });
    },
  });

  const removeFavorite = useMutation({
    mutationFn: async (cityId: string) => {
      if (onAccount) {
        await favoritesApi.remove(cityId);
        return null;
      }
      const next = readFavorites().filter((city) => city.id !== cityId);
      writeFavorites(next);
      return next;
    },
    onSuccess: (next) => {
      if (next) queryClient.setQueryData(LOCAL_KEY, next);
      else void queryClient.invalidateQueries({ queryKey: SERVER_KEY });
    },
  });

  const favorites = favoritesQuery.data ?? [];
  const findFavorite = (lat: number, lon: number) =>
    favorites.find((city) => sameCoordinates(city, lat, lon));

  return {
    favorites,
    isLoading: favoritesQuery.isLoading,
    addFavorite,
    removeFavorite,
    findFavorite,
    isFavorite: (lat: number, lon: number) => findFavorite(lat, lon) !== undefined,
  };
}
