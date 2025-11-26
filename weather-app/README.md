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

Yêu cầu: Node.js >= 16, npm hoặc pnpm.

1. Clone repository

```powershell
git clone <repo-url>
cd weather-app
```

2. Cài dependencies

```powershell
npm install
```

3. Tạo file biến môi trường

Tạo file `.env` ở gốc dự án với nội dung:

```
VITE_OPENWEATHER_API_KEY=your_openweather_api_key_here
```


4. Cấu trúc thư mục (Folder Structure)

Tóm tắt cấu trúc chính (chỉ liệt kê các file/folder quan trọng):

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

6. API Documentation (Frontend sử dụng OpenWeatherMap)

Ứng dụng gọi OpenWeatherMap; cấu hình nằm ở `src/api/config.ts`:

- `BASE_URL`: `https://api.openweathermap.org/data/2.5`
- `GEO`: `http://api.openweathermap.org/geo/1.0`
- `API_KEY`: lấy từ `import.meta.env.VITE_OPENWEATHER_API_KEY`

Các endpoint thường dùng (ví dụ):

- Geocoding (tìm toạ độ theo tên thành phố):

  - `GET http://api.openweathermap.org/geo/1.0/direct?q={city name}&limit=1&appid={API key}`

- Current weather / One Call (dự báo):
  - `GET https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&units=metric&appid={API key}`
  - `GET https://api.openweathermap.org/data/2.5/onecall?lat={lat}&lon={lon}&units=metric&appid={API key}` (nếu dùng)

Lưu ý API:

- Thay `{API key}` bằng giá trị `VITE_OPENWEATHER_API_KEY`.
- Hạn chế rate-limit: dùng caching (react-query) và tránh gọi API quá thường xuyên.


