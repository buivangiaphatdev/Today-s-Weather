import { LogIn, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/auth-provider";
import { Button } from "./ui/button";

// Header: "Sign in" when signed out, the account and a sign-out button when signed in
export function AccountButton() {
  const { status, user, logout } = useAuth();

  if (status === "loading") return null;

  if (status === "signed-out" || !user) {
    return (
      <Button asChild variant="outline">
        <Link to="/login">
          <LogIn />
          <span className="hidden sm:inline">Sign in</span>
        </Link>
      </Button>
    );
  }

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out");
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline"
        title={user.email}
      >
        {user.name ?? user.email}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={handleLogout}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut />
      </Button>
    </div>
  );
}
