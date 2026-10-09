// Prints per-phase progress by counting checkboxes in docs/ROADMAP.md
import { readFileSync } from "node:fs";

const lines = readFileSync(new URL("../docs/ROADMAP.md", import.meta.url), "utf8").split(/\r?\n/);

const sections = [];
let current = null;
for (const line of lines) {
  const heading = line.match(/^## (.+)/);
  if (heading) {
    current = { name: heading[1], done: 0, total: 0, wip: 0 };
    sections.push(current);
    continue;
  }
  const box = line.match(/^\s*- \[( |x|X)\] (.*)/);
  if (!box || !current) continue;
  current.total++;
  if (box[1] !== " ") current.done++;
  else if (box[2].includes("🚧")) current.wip++;
}

const bar = (ratio, width = 20) => "█".repeat(Math.round(ratio * width)).padEnd(width, "░");
const tracked = sections.filter((s) => s.total > 0);

let done = 0;
let total = 0;
for (const s of tracked) {
  const ratio = s.done / s.total;
  const wip = s.wip ? `  (${s.wip} đang làm)` : "";
  console.log(
    `${bar(ratio)} ${String(Math.round(ratio * 100)).padStart(3)}%  ${s.done}/${s.total}  ${s.name}${wip}`,
  );
  if (!s.name.startsWith("Backlog")) {
    done += s.done;
    total += s.total;
  }
}
console.log(`\nTổng (không tính backlog): ${done}/${total} — ${Math.round((done / total) * 100)}%`);
