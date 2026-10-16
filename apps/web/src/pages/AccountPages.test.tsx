import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../api/http";
import { AuthProvider } from "../context/auth-provider";
import { GoogleCallbackPage, ResetPasswordPage, VerifyEmailPage } from "./AccountPages";
import AuthPage from "./AuthPage";

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const session = {
  accessToken: "t",
  expiresIn: 900,
  user: {
    id: "u1",
    email: "an@gmail.com",
    name: "An",
    emailVerified: true,
    settings: { units: "metric", language: "vi", theme: "system" },
    createdAt: "2026-10-16T00:00:00.000Z",
  },
};

function renderAt(path: string, hash: string, page: ReactNode) {
  // The pages read the fragment from window.location, like after a real redirect
  window.history.replaceState(null, "", `${path}${hash}`);
  render(
    <StrictMode>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={path} element={page} />
              <Route path="/" element={<p>Home page</p>} />
              <Route path="/login" element={<p>Login page</p>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe("pages reached from email links and Google", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const callsTo = (path: string) =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));
  let respond: (path: string) => Response;

  beforeEach(() => {
    setSession(null);
    vi.stubGlobal("fetch", fetchMock);
    respond = () => json({ code: "invalid_refresh_token", message: "x" }, 401);
    fetchMock.mockImplementation(async (url) => respond(String(url)));
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("confirms the email once, even under StrictMode, and removes the token from the URL", async () => {
    respond = (url) => (url.endsWith("/verify-email") ? json(undefined, 204) : json({}, 401));
    renderAt("/verify-email", "#token=secret-token-from-the-email", <VerifyEmailPage />);

    expect(await screen.findByText("Your email is confirmed.")).toBeInTheDocument();
    expect(callsTo("/verify-email")).toHaveLength(1);
    expect(JSON.parse(String(callsTo("/verify-email")[0][1]?.body))).toEqual({
      token: "secret-token-from-the-email",
    });
    expect(window.location.hash).toBe("");
  });

  it("shows the API's message for an expired verification link", async () => {
    respond = (url) =>
      url.endsWith("/verify-email")
        ? json({ message: "This link is invalid or has expired" }, 400)
        : json({}, 401);
    renderAt("/verify-email", "#token=expired-token-xxxxxxxxxxxx", <VerifyEmailPage />);

    expect(await screen.findByText("This link is invalid or has expired")).toBeInTheDocument();
  });

  it("resets the password with the token from the link", async () => {
    respond = (url) => (url.endsWith("/password/reset") ? json(undefined, 204) : json({}, 401));
    renderAt("/reset-password", "#token=reset-token-from-the-email", <ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(callsTo("/password/reset")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "a new strong password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(JSON.parse(String(callsTo("/password/reset")[0][1]?.body))).toEqual({
      token: "reset-token-from-the-email",
      password: "a new strong password",
    });
  });

  it("exchanges the Google hand-off code (with cookie + CSRF header) and goes home", async () => {
    respond = (url) => (url.endsWith("/google/exchange") ? json(session) : json({}, 401));
    renderAt("/auth/callback", "#code=one-time-hand-off-code", <GoogleCallbackPage />);

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    const [, init] = callsTo("/google/exchange")[0];
    expect(callsTo("/google/exchange")).toHaveLength(1);
    expect(init?.credentials).toBe("include");
    expect((init?.headers as Record<string, string>)["X-Requested-With"]).toBe("fetch");
  });

  it("offers Google on the sign-in page when the API has it configured", async () => {
    respond = (url) => (url.endsWith("/providers") ? json({ google: true }) : json({}, 401));
    renderAt("/login", "#error=google", <AuthPage mode="login" />);

    const google = await screen.findByRole("link", { name: "Continue with Google" });
    expect(google).toHaveAttribute("href", "/api/auth/google");
    expect(screen.getByText(/Google sign-in did not complete/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
