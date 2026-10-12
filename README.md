# Today's Weather

1. Project Title

- Today's Weather — Ứng dụng web hiển thị thời tiết hiện tại và dự báo theo giờ cho các thành phố.

2. Giới thiệu (Introduction)

Ứng dụng cho phép người dùng tìm kiếm thành phố, xem thời tiết hiện tại, dự báo theo giờ, lưu thành phố yêu thích và tùy chỉnh theme (sáng/tối). Ứng dụng được xây dựng bằng React + TypeScript và sử dụng OpenWeatherMap làm nguồn dữ liệu thời tiết.

3. Tính năng (Features)

- Tìm kiếm thành phố với gợi ý và lịch sử tìm kiếm.
- Hiển thị thời tiết hiện tại: nhiệt độ, trạng thái, icon, độ ẩm, áp suất, gió.
- Dự báo theo giờ với biểu đồ nhiệt độ.
- Lưu / quản lý danh sách thành phố yêu thích (Favorites) lưu trên Local Storage.
- Lấy vị trí hiện tại (Geolocation) để hiển thị thời tiết địa phương.
- Theme toggle (Light / Dark) và lưu lựa chọn người dùng.
- Skeleton loading và thông báo (toast) cho trạng thái fetch/ lỗi.

4. Công nghệ sử dụng (Tech Stack)

- Frontend: React 19, TypeScript
- Bundler / Dev server: Vite
- Styling: Tailwind CSS, `tailwind-merge`
- Data fetching / cache: `@tanstack/react-query`
- Routing: `react-router-dom`
- Charts: `recharts`
- Date handling: `date-fns`
- Theme: `next-themes`
- UI primitives: `@radix-ui/react-*` (Dialog, Tooltip, ScrollArea, Slot)
- Notifications: `sonner`
- Icons: `lucide-react`
- Utilities: `clsx`, `class-variance-authority`, `cmdk` (command palette nếu dùng)

Dev / Lint / Build tools:

- TypeScript, ESLint, `@vitejs/plugin-react`, Vite

5. Cài đặt (Installation)

Yêu cầu: Node.js >= 22, pnpm 10 (`corepack enable` hoặc `npm i -g pnpm@10.34.5`).

1. Clone repository

```powershell
git clone <repo-url>
cd Today-s-Weather
```

2. Cài dependencies (cho toàn bộ monorepo)

```powershell
pnpm install
```

3. Tạo file biến môi trường

Backend: copy `apps/api/.env.example` thành `apps/api/.env` rồi điền `OPENWEATHER_API_KEY`. API kiểm tra env khi khởi động (Zod) và dừng ngay nếu thiếu hoặc sai.

Frontend không cần API key. Ở local để trống `VITE_API_URL` (hoặc không tạo `apps/web/.env`): Vite proxy `/api` sang `http://localhost:3000`, nên cần chạy cả API (`pnpm dev` chạy cả hai).

4. Chạy

Redis/Postgres local (cần Docker Desktop): `pnpm infra:up` rồi đặt `REDIS_URL=redis://127.0.0.1:6380` trong `apps/api/.env`. Cổng host là 6380/5433 để không đụng Redis/Postgres có sẵn trên máy hoặc trong WSL. Không có Redis thì API vẫn chạy, cache và rate limit nằm trong bộ nhớ.

```powershell
pnpm dev          # chạy dev server của mọi app
pnpm build        # build mọi app (có cache Turborepo)
pnpm lint         # lint
pnpm test         # chạy test một lần
pnpm format       # format code bằng Prettier
pnpm infra:up     # Redis (6380) + Postgres (5433) bằng docker compose
pnpm infra:down   # tắt
pnpm --filter web dev   # chỉ chạy app web (http://localhost:5173)
pnpm --filter api dev   # chỉ chạy API (http://localhost:3000/api)
```

Cấu trúc thư mục (Folder Structure)

Monorepo dùng pnpm workspaces + Turborepo:

- `apps/web/` — frontend React (Vite)
- `apps/api/` — backend NestJS 11 (config + Zod, pino logger, helmet, CORS)
- `packages/shared/` — type / schema dùng chung giữa web và api

Bên trong `apps/web/`:

- `src/`
  - `main.tsx`, `App.tsx` — entry và layout chính
  - `api/`
    - `config.ts` — cấu hình endpoint & API key
    - `weather.ts` — wrapper gọi OpenWeatherMap (nếu có)
    - `types.ts` — kiểu dữ liệu liên quan API
  - `components/` — các component chính
    - `city-search.tsx` — tìm kiếm thành phố
    - `current-weather.tsx` — hiển thị weather hiện tại
    - `weather-forecast.tsx`, `hourly-temprature.tsx` — dự báo và biểu đồ
    - `favorite-button.tsx`, `favorite-cities.tsx` — favorite flow
    - `theme-toggle.tsx`, `header.tsx`, `layout.tsx`
    - `loading-skeleton.tsx` — skeleton UI
    - `ui/` — primitives (button, card, tooltip, dialog, skeleton,...)
  - `hooks/`
    - `use-weather.ts`, `use-geolocation.ts`, `use-favorite.ts`, `use-local-storage.ts`, `use-search-history.ts`
  - `context/`
    - `theme-provider.tsx`
  - `pages/`
    - `WeatherDashboard.tsx`, `CityPage.tsx`

5. Cách sử dụng (Usage)

- Mở trang, dùng thanh tìm kiếm để nhập tên thành phố.
- Chọn kết quả gợi ý để xem weather hiện tại và dự báo theo giờ.
- Click nút hình trái tim/ favorite để lưu thành phố vào danh sách yêu thích.
- Mở danh sách favorite để chuyển nhanh giữa các thành phố đã lưu.
- Bật/tắt theme (Light/Dark) bằng nút toggle.
- Cho phép truy cập vị trí (geolocation) để tự động hiển thị weather tại vị trí hiện tại.

API backend (`apps/api`)

Proxy tới OpenWeather: API key chỉ nằm ở server, response chỉ giữ các field app dùng (type trong `packages/shared`). Đơn vị metric.

| Endpoint                    | Query                              | Trả về                              |
| --------------------------- | ---------------------------------- | ----------------------------------- |
| `GET /api/weather/current`  | `lat` (-90..90), `lon` (-180..180) | `WeatherData`                       |
| `GET /api/weather/forecast` | `lat`, `lon`                       | `ForecastData` (5 ngày, bước 3 giờ) |
| `GET /api/geo/search`       | `q` (2–100 ký tự)                  | `GeocodingResponse[]` (tối đa 5)    |
| `GET /api/geo/reverse`      | `lat`, `lon`                       | `GeocodingResponse[]` (0 hoặc 1)    |
| `GET /api/health`           |                                    | `{ status, uptimeSeconds, checks }` |

Cache (Redis nếu có `REDIS_URL`, không thì bộ nhớ): current 10 phút, forecast 30 phút, geo 7 ngày; toạ độ làm tròn 2 chữ số (~1,1 km) trong key. Header `X-Cache: HIT | MISS`. Redis lỗi thì API vẫn trả lời (bỏ qua cache, đếm rate limit trong bộ nhớ) và `/api/health` báo `degraded`. Health không bị rate limit.

Mã lỗi:

- `400` query sai, kèm `errors` theo từng field (không gọi OpenWeather)
- `404` OpenWeather không tìm thấy vị trí
- `429` vượt rate limit theo IP: 20 request/giây và 120 request/phút (header `Retry-After-burst` / `Retry-After-sustained`)
- `502` OpenWeather lỗi hoặc từ chối key · `503` hết quota OpenWeather · `504` OpenWeather quá 5 giây không trả lời

6. Deploy (Vercel, 2 project từ cùng repo)

| Project | Root Directory | Build                                                               | Biến môi trường                                                                           |
| ------- | -------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| web     | `apps/web`     | `apps/web/vercel.json` (turbo build web + shared)                   | `VITE_API_URL` = URL production của API (Production + Preview)                            |
| api     | `apps/api`     | `apps/api/vercel.json` (turbo build api + shared), framework NestJS | `OPENWEATHER_API_KEY`, `CORS_ORIGINS`, `TRUST_PROXY=1`, `REDIS_URL` (Upstash `rediss://`) |

- Web gọi thẳng domain API (không rewrite qua Vercel): Vercel ghi đè `X-Forwarded-For` khi proxy, rate limit sẽ chỉ thấy 1 IP.
- `CORS_ORIGINS` của API: domain production của web + pattern preview, ví dụ `https://today-s-weather-web.vercel.app,https://today-s-weather-*-buivangiaphats-projects.vercel.app`.
- Merge vào `main` → cả 2 project tự deploy production.
