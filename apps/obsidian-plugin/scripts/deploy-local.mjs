import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "asset-hub-sync";
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
if (!vaultPath) {
  console.error("请先设置 OBSIDIAN_VAULT_PATH 指向测试 vault 的根目录。");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(resolve(vaultPath), ".obsidian", "plugins", PLUGIN_ID);
await mkdir(target, { recursive: true });

for (const artifact of ARTIFACTS) {
  await copyFile(join(root, artifact), join(target, artifact));
  console.log(`已复制 ${artifact}`);
}

console.log(`已部署到 ${target}，在 Obsidian 中执行「重新加载插件」即可生效。`);
