import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../api/http";
import { AuthProvider } from "../context/auth-provider";
import AuthPage from "./AuthPage";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function renderPage(mode: "login" | "register") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/${mode}`]}>
          <Routes>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/" element={<p>Home page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("AuthPage", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const requestsTo = (path: string) =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));

  beforeEach(() => {
    setSession(null);
    vi.stubGlobal("fetch", fetchMock);
    // No refresh cookie: the app starts signed out
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/refresh")
        ? json({ code: "invalid_refresh_token", message: "x" }, 401)
        : json({}, 404),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("validates with the shared schema before calling the API", async () => {
    renderPage("register");
    fill(/email/i, "not-an-email");
    fill(/password/i, "short");

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Invalid email")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(requestsTo("/register")).toHaveLength(0);
  });

  it("shows the API's message when sign-in fails", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/login")
        ? json({ message: "Invalid email or password" }, 401)
        : json({ code: "invalid_refresh_token", message: "x" }, 401),
    );
    renderPage("login");
    fill(/email/i, "an@example.com");
    fill(/password/i, "wrong-password");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });

  it("explains rate limiting in plain words", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/login")
        ? json({ message: "ThrottlerException" }, 429)
        : json({ code: "invalid_refresh_token", message: "x" }, 401),
    );
    renderPage("login");
    fill(/email/i, "an@example.com");
    fill(/password/i, "whatever-password");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
  });

  it("signs in, sends the cookie request with credentials and goes home", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/login")) {
        return json({
          accessToken: "t",
          expiresIn: 900,
          user: {
            id: "u1",
            email: "an@example.com",
            name: "An",
            emailVerified: false,
            settings: { units: "metric", language: "vi", theme: "system" },
            createdAt: "2026-10-12T00:00:00.000Z",
          },
        });
      }
      return json({ code: "invalid_refresh_token", message: "x" }, 401);
    });
    renderPage("login");
    fill(/email/i, "AN@example.com ");
    fill(/password/i, "correct-password");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    const [, init] = requestsTo("/login")[0];
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "an@example.com",
      password: "correct-password",
    });
    await waitFor(() => expect(screen.queryByText("Sign in")).not.toBeInTheDocument());
  });
});
