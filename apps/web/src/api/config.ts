// Base URL of the backend. Empty in local dev: Vite proxies /api to localhost:3000
// (see vite.config.ts). On Vercel it is the API deployment, e.g. https://x.vercel.app
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
