import { loginSchema, registerSchema } from "@weather/shared";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "../api/account";
import { ApiError } from "../api/http";
import { useHashParam } from "../hooks/use-hash-param";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Field } from "../components/form-field";
import { useAuth } from "../context/auth-provider";

type Mode = "login" | "register";
type FieldErrors = Partial<Record<"email" | "password" | "name", string>>;

const copy = {
  login: {
    title: "Sign in",
    description: "Sync your favorite cities and searches across devices.",
    submit: "Sign in",
    switchText: "No account yet?",
    switchLink: { to: "/register", label: "Create one" },
  },
  register: {
    title: "Create an account",
    description: "Your favorites on this device will be saved to the new account.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: { to: "/login", label: "Sign in" },
  },
} as const;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
    return error.message;
  }
  return "Could not reach the server. Check your connection and try again.";
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const { status, login, register } = useAuth();
  const navigate = useNavigate();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Google redirects back here with #error=google when sign-in did not complete
  const googleError = useHashParam("error");
  const [formError, setFormError] = useState<string | null>(
    googleError ? "Google sign-in did not complete. Please try again." : null,
  );
  const { data: providers } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: authApi.providers,
    staleTime: Infinity,
  });
  const [submitting, setSubmitting] = useState(false);
  const text = copy[mode];

  if (status === "signed-in") return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    if (form.name === "") delete form.name;

    // Same schemas as the API, so most mistakes are caught before a request
    const parsed = (mode === "login" ? loginSchema : registerSchema).safeParse(form);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const user = mode === "login" ? await login(parsed.data) : await register(parsed.data);
      toast.success(`Signed in as ${user.name ?? user.email}`);
      navigate("/");
    } catch (error) {
      setFormError(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto mt-8 max-w-md">
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {mode === "register" && (
            <Field
              label="Name (optional)"
              name="name"
              autoComplete="name"
              error={fieldErrors.name}
            />
          )}
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={fieldErrors.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            error={fieldErrors.password}
            hint={mode === "register" ? "At least 8 characters" : undefined}
          />
          {mode === "login" && (
            <Link
              to="/forgot-password"
              className="-mt-2 block text-right text-sm text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          )}

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            {text.submit}
          </Button>
          {providers?.google && (
            <Button asChild type="button" variant="outline" className="w-full">
              {/* Full-page navigation: the API redirects to Google and back */}
              <a href={authApi.googleSignInUrl()}>Continue with Google</a>
            </Button>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {text.switchText}{" "}
            <Link
              to={text.switchLink.to}
              className="text-primary underline-offset-4 hover:underline"
            >
              {text.switchLink.label}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
