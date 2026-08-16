#!/usr/bin/env node

import { copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , caddyPathArg, authEnvPathArg] = process.argv;
if (!caddyPathArg || !authEnvPathArg) {
  console.error("usage: patch-platform-config.mjs <Caddyfile> <auth.env>");
  process.exit(2);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const caddyPath = resolve(caddyPathArg);
const authEnvPath = resolve(authEnvPathArg);
const snippetPath = resolve(scriptDir, "asset-hub.caddy");
const startMarker = "# BEGIN ASSET HUB MANAGED ROUTES";
const endMarker = "# END ASSET HUB MANAGED ROUTES";

function backup(path) {
  copyFileSync(path, `${path}.asset-hub.bak`);
}

function writePreservingMode(path, contents) {
  const mode = statSync(path).mode;
  writeFileSync(path, contents, { mode });
}

function withoutManagedBlock(source) {
  const start = source.indexOf(startMarker);
  if (start < 0) return source;
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`found ${startMarker} without ${endMarker}`);
  return `${source.slice(0, start)}${source.slice(end + endMarker.length)}`.replace(
    /\n{3,}/g,
    "\n\n",
  );
}

function patchCaddy() {
  const snippet = readFileSync(snippetPath, "utf8").trim();
  let source = withoutManagedBlock(readFileSync(caddyPath, "utf8"));
  const anchor = "\n\t@analytics host analytics.shiguanglab.com";
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error("access-gateway Caddyfile anchor was not found");
  source = `${source.slice(0, index)}\n\n${snippet}\n${source.slice(index)}`;
  backup(caddyPath);
  writePreservingMode(caddyPath, source);
}

function addCSVValue(source, key, value) {
  const pattern = new RegExp(`^${key}=(.*)$`, "m");
  const match = source.match(pattern);
  if (!match) throw new Error(`${key} was not found in auth.env`);
  const values = (match[1] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.includes(value)) values.push(value);
  return source.replace(pattern, `${key}=${values.join(",")}`);
}

function patchAuthEnv() {
  let source = readFileSync(authEnvPath, "utf8");
  source = addCSVValue(source, "ALLOWED_RETURN_ORIGINS", "https://doc.shiguanglab.com");
  source = addCSVValue(source, "DEFAULT_ENTITLEMENTS", "asset-hub:access");
  backup(authEnvPath);
  writePreservingMode(authEnvPath, source);
}

patchCaddy();
patchAuthEnv();
console.log(`patched ${caddyPath}`);
console.log(`patched ${authEnvPath}`);
