import { forgotPasswordSchema, passwordSchema } from "@weather/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authApi } from "../api/account";
import { ApiError, refreshSession } from "../api/http";
import { Field } from "../components/form-field";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useAuth } from "../context/auth-provider";
import { useHashParam } from "../hooks/use-hash-param";

// Pages reached from email links and the Google sign-in redirect. Their secrets
// arrive in the URL fragment (#token= / #code=), read once by useHashParam.

const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.status === 429
      ? "Too many attempts. Please wait a minute and try again."
      : error.message
    : "Could not reach the server. Check your connection and try again.";

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="mx-auto mt-8 max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// Runs a one-time action once on mount (StrictMode mounts twice in development; a
// one-time token must not be spent twice)
function useOnce(action: () => Promise<void>) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void action();
  }, [action]);
}

// /verify-email#token=...
export function VerifyEmailPage() {
  const token = useHashParam("token");
  const { status } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [error, setError] = useState("This link is incomplete. Open it again from the email.");

  useOnce(async () => {
    if (!token) return;
    try {
      await authApi.verifyEmail(token);
      setState("done");
      // Signed in on this device: refresh so the profile shows the verified email
      if (status !== "signed-out") await refreshSession();
    } catch (err) {
      setError(errorMessage(err));
      setState("failed");
    }
  });

  return (
    <Page title="Confirm your email">
      {state === "working" && <Loader2 className="mx-auto animate-spin" aria-label="Confirming" />}
      {state === "done" && (
        <p className="flex items-center gap-2">
          <CheckCircle2 className="text-green-500" /> Your email is confirmed.
        </p>
      )}
      {state === "failed" && <Problem>{error}</Problem>}
      <Button asChild variant="outline" className="w-full">
        <Link to="/">Back to the weather</Link>
      </Button>
    </Page>
  );
}

// /forgot-password
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) return setFieldError(parsed.error.issues[0].message);
    setFieldError(undefined);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(parsed.data.email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Page title="Check your inbox">
        <p>
          If an account exists for that email, a link to choose a new password is on its way. It
          works for 1 hour.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </Page>
    );
  }

  return (
    <Page title="Forgot your password?" description="We will email you a link to choose a new one.">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" error={fieldError} />
        {error && <Problem>{error}</Problem>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          Send reset link
        </Button>
      </form>
    </Page>
  );
}

// /reset-password#token=...
export function ResetPasswordPage() {
  const token = useHashParam("token");
  const navigate = useNavigate();
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(
    token ? null : "This link is incomplete. Open it again from the email.",
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    const parsed = passwordSchema.safeParse(new FormData(event.currentTarget).get("password"));
    if (!parsed.success) return setFieldError(parsed.error.issues[0].message);
    setFieldError(undefined);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, parsed.data);
      toast.success("Password changed. Sign in with your new password.");
      navigate("/login");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page title="Choose a new password" description="You will be signed out on all your devices.">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          error={fieldError}
          disabled={!token}
        />
        {error && <Problem>{error}</Problem>}
        <Button type="submit" className="w-full" disabled={submitting || !token}>
          {submitting && <Loader2 className="animate-spin" />}
          Save new password
        </Button>
        {!token && (
          <Link
            to="/forgot-password"
            className="block text-center text-sm text-primary hover:underline"
          >
            Ask for a new link
          </Link>
        )}
      </form>
    </Page>
  );
}

// /auth/callback#code=... (Google sign-in): exchange the one-time code for a session.
// The exchange runs from this page so the session cookie belongs to the web app.
export function GoogleCallbackPage() {
  const code = useHashParam("code");
  const navigate = useNavigate();
  const [failed, setFailed] = useState(!code);

  useOnce(async () => {
    if (!code) return;
    try {
      const session = await authApi.googleExchange(code);
      toast.success(`Signed in as ${session.user.name ?? session.user.email}`);
      navigate("/", { replace: true });
    } catch {
      setFailed(true);
    }
  });

  return (
    <Page title="Signing you in…">
      {failed ? (
        <>
          <Problem>Google sign-in did not complete. Please try again.</Problem>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </>
      ) : (
        <Loader2 className="mx-auto animate-spin" aria-label="Signing in" />
      )}
    </Page>
  );
}
