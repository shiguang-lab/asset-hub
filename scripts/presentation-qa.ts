import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectPresentationHtmlQuality } from "../packages/content/src/presentation-qa.ts";

const file = process.argv[2];
if (!file) {
  console.error("用法：pnpm presentation:qa <presentation.html>");
  process.exit(2);
}

const html = readFileSync(resolve(file), "utf8");
const report = inspectPresentationHtmlQuality(html);
console.log(JSON.stringify(report, null, 2));
if (report.issues.some((issue) => issue.severity === "error")) process.exit(1);
