import { useState } from "react";
import { API_BASE_URL } from "../api/config";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

// TEMPORARY (P2-00): manual browser test for cross-site refresh-token cookies.
// Not linked anywhere; open /dev/cookie-spike. Remove when P2-03 lands.

interface CheckResult {
  partitioned: string | null;
  plain: string | null;
}

const SPIKE_URL = `${API_BASE_URL}/api/auth/spike`;
const call = (method: "GET" | "POST" | "DELETE") =>
  fetch(SPIKE_URL, { method, credentials: "include" });

const CookieSpikePage = () => {
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);

  const append = (line: string) =>
    setLog((lines) => [...lines, `${new Date().toLocaleTimeString()}  ${line}`]);

  const run = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      append(`${label}: lỗi ${String(error)}`);
    }
  };

  const setCookies = () =>
    run("Đặt cookie", async () => {
      const res = await call("POST");
      append(`Đặt cookie: HTTP ${res.status} ${JSON.stringify(await res.json())}`);
    });

  const check = () =>
    run("Kiểm tra", async () => {
      const res = await call("GET");
      const body = (await res.json()) as CheckResult;
      setResult(body);
      append(`Kiểm tra: ${JSON.stringify(body)}`);
    });

  const clear = () =>
    run("Xoá", async () => {
      const res = await call("DELETE");
      setResult(null);
      append(`Xoá cookie: HTTP ${res.status}`);
    });

  const report = JSON.stringify(
    {
      userAgent: navigator.userAgent,
      api: SPIKE_URL,
      page: window.location.origin,
      partitionedKept: result ? result.partitioned !== null : "chưa kiểm tra",
      plainKept: result ? result.plain !== null : "chưa kiểm tra",
    },
    null,
    2,
  );

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Thử cookie cross-site (P2-00)</CardTitle>
        <CardDescription>
          Bấm 1 → 2. Sau đó tải lại trang (hoặc đóng tab rồi mở lại) và bấm 2 lần nữa. Gửi lại phần
          "Kết quả" cho từng trình duyệt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={setCookies}>1. Đặt cookie</Button>
          <Button onClick={check}>2. Kiểm tra</Button>
          <Button variant="outline" onClick={clear}>
            Xoá cookie
          </Button>
        </div>

        {result && (
          <ul className="space-y-1 text-sm">
            <li>
              Cookie <code>Partitioned</code>: {result.partitioned ? "✅ được giữ" : "❌ không có"}
            </li>
            <li>Cookie thường (third-party): {result.plain ? "✅ được giữ" : "❌ không có"}</li>
          </ul>
        )}

        <div>
          <p className="mb-1 text-sm font-medium">Kết quả</p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{report}</pre>
          <Button
            className="mt-2"
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(report)}
          >
            Copy kết quả
          </Button>
        </div>

        {log.length > 0 && (
          <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">
            {log.join("\n")}
          </pre>
        )}
      </CardContent>
    </Card>
  );
};

export default CookieSpikePage;
