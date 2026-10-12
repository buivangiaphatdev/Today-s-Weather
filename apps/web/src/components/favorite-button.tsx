import { toast } from "sonner";
import type { WeatherData } from "../api/types";
import { useFavorites } from "../hooks/use-favorite";
import { Button } from "./ui/button";
import { Star } from "lucide-react";

interface FavoriteButtonProps {
  data: WeatherData;
}

export function FavoriteButton({ data }: FavoriteButtonProps) {
  const { addFavorite, removeFavorite, findFavorite } = useFavorites();
  const favorite = findFavorite(data.coord.lat, data.coord.lon);
  const isCurrentlyFavorite = favorite !== undefined;

  const handleToggleFavorite = () => {
    if (isCurrentlyFavorite) {
      removeFavorite.mutate(favorite.id);
      toast.error(`Removed ${data.name} from Favorites`);
    } else {
      addFavorite.mutate({
        name: data.name,
        lat: data.coord.lat,
        lon: data.coord.lon,
        country: data.sys.country,
      });
      toast.success(`Added ${data.name} to Favorites`);
    }
  };

  return (
    <Button
      variant={isCurrentlyFavorite ? "default" : "outline"}
      size="icon"
      onClick={handleToggleFavorite}
      className={isCurrentlyFavorite ? "bg-yellow-500 hover:bg-yellow-600" : ""}
    >
      <Star className={`h-4 w-4 ${isCurrentlyFavorite ? "fill-current" : ""}`} />
    </Button>
  );
}
