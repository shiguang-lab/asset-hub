#!/usr/bin/env node
/**
 * 发布 asset-hub 的 Skill：把 skills/ 下每个含 SKILL.md 的目录发布到 Skill Gateway，
 * 并分配给 asset-hub Agent。幂等（同名 Skill 复用，相同内容重复发布为 no-op）。
 *
 * 用法：
 *   SKILL_GATEWAY_URL=http://100.87.115.78:3110/api \
 *   SKILL_GATEWAY_SERVICE_TOKEN=<OPC_TOKEN> \
 *   CAPABILITY_AGENT_ID=asset-hub \
 *   node skills/seed-skills.mjs
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_GATEWAY = process.env.SKILL_GATEWAY_URL ?? "http://100.87.115.78:3110/api";
const TOKEN =
  process.env.SKILL_GATEWAY_SERVICE_TOKEN ??
  process.env.SKILL_GATEWAY_TOKEN ??
  process.env.OPC_TOKEN ??
  "";
const AGENT_ID = process.env.CAPABILITY_AGENT_ID ?? "asset-hub";
const SEED_DIR = dirname(fileURLToPath(import.meta.url));

if (!TOKEN) {
  console.error("缺少 SKILL_GATEWAY_SERVICE_TOKEN、SKILL_GATEWAY_TOKEN（或 OPC_TOKEN）");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${SKILL_GATEWAY.replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "x-opc-caller-id": "service:skill-seed",
      "x-opc-caller-role": "service",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  }
  return {
    status: res.status,
    json: res.status === 204 ? null : await res.json().catch(() => null),
  };
}

/** 解析极简 YAML frontmatter（name/description/version + tags 列表）。 */
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = { tags: [] };
  if (!m) return fm;
  const lines = m[1].split(/\r?\n/);
  let inTags = false;
  for (const line of lines) {
    const tag = line.match(/^\s*-\s*(.+)$/);
    if (inTags && tag) {
      fm.tags.push(tag[1].trim());
      continue;
    }
    inTags = false;
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[1] === "tags") {
      inTags = true;
    } else {
      fm[kv[1]] = kv[2].trim();
    }
  }
  return fm;
}

async function collectFiles(dir, base = dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) {
      out.push(...(await collectFiles(full, base)));
    } else {
      out.push({
        path: relative(base, full),
        contentBase64: (await readFile(full)).toString("base64"),
      });
    }
  }
  return out;
}

async function findSkillByName(name) {
  const { json } = await api("GET", "/skills");
  return (json ?? []).find((s) => s.name === name);
}

async function main() {
  const dirs = (await readdir(SEED_DIR, { withFileTypes: true })).filter((d) => d.isDirectory());
  for (const d of dirs) {
    const dir = join(SEED_DIR, d.name);
    const skillMd = await readFile(join(dir, "SKILL.md"), "utf8").catch(() => null);
    if (!skillMd) continue;

    const fm = parseFrontmatter(skillMd);
    const name = fm.name ?? d.name;
    const version = fm.version ?? "1.0.0";

    let skill = await findSkillByName(name);
    if (!skill) {
      const { json } = await api("POST", "/skills", {
        name,
        description: fm.description,
        tags: fm.tags,
      });
      skill = json;
    }

    await api("POST", `/skills/${skill.id}/versions`, { version, files: await collectFiles(dir) });
    await api("PUT", `/skills/assignments/${AGENT_ID}/${skill.id}`, { version });

    console.log(`✓ ${name}@${version} 发布并分配给 ${AGENT_ID}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
