// The package is "type": "module", so .js files are ESM by default. This marks
// dist/cjs as CommonJS for apps/api (NestJS compiles to CommonJS).
import { writeFileSync } from "node:fs";

writeFileSync(new URL("../dist/cjs/package.json", import.meta.url), '{ "type": "commonjs" }\n');
