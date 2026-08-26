import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

/** Prompt text is kept as editable files, separate from workflow code. */
export async function loadPresentationPrompt(
  name: string,
  vars: Record<string, string> = {},
): Promise<string> {
  const raw = await readFile(join(PROMPTS_DIR, `${name}.md`), "utf8");
  return raw.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
