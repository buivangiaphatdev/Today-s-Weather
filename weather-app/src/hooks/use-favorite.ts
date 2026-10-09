import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface FavoriteCity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
  addedAt: number;
}

const STORAGE_KEY = "favorites";
const QUERY_KEY = ["favorites"];

// localStorage is the single source of truth; every hook instance reads through the query cache
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

export function useFavorites() {
  const queryClient = useQueryClient();

  const favoritesQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: readFavorites,
    initialData: readFavorites,
    staleTime: Infinity, // Only changes through the mutations below
  });

  const addFavorite = useMutation({
    mutationFn: async (city: Omit<FavoriteCity, "id" | "addedAt">) => {
      const current = readFavorites();
      const id = `${city.lat}-${city.lon}`;

      // Prevent duplicates
      if (current.some((fav) => fav.id === id)) return current;

      const newFavorites = [...current, { ...city, id, addedAt: Date.now() }];
      writeFavorites(newFavorites);
      return newFavorites;
    },
    onSuccess: (newFavorites) => {
      queryClient.setQueryData(QUERY_KEY, newFavorites);
    },
  });

  const removeFavorite = useMutation({
    mutationFn: async (cityId: string) => {
      const newFavorites = readFavorites().filter((city) => city.id !== cityId);
      writeFavorites(newFavorites);
      return newFavorites;
    },
    onSuccess: (newFavorites) => {
      queryClient.setQueryData(QUERY_KEY, newFavorites);
    },
  });

  const favorites = favoritesQuery.data;

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite: (lat: number, lon: number) =>
      favorites.some((city) => city.lat === lat && city.lon === lon),
  };
}
