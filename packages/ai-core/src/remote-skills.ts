import { createHash } from "node:crypto";
import { createSkill, type InlineSkill } from "@mastra/core/skills";
import { BlobStore, type SkillVersionTree, type StorageBlobEntry } from "@mastra/core/storage";
import { CompositeVersionedSkillSource, Workspace } from "@mastra/core/workspace";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface SkillManifestEntry {
  blobHash: string;
  size: number;
  mimeType?: string;
  encoding?: string;
}

export interface AgentSkillEntry {
  skillId?: string;
  name: string;
  version: string;
  versionId: string;
  digest: string;
  versionTree: { entries: Record<string, SkillManifestEntry> };
  enabled: boolean;
}

export interface AgentSkillManifest {
  agentId: string;
  revision: string;
  skills: AgentSkillEntry[];
}

interface SkillDownloadGrant {
  blobBaseUrl: string;
  downloadToken: string;
  tokenExpiresAt: string;
}

export interface MastraRemoteSkillConfig {
  token: string;
  agentId: string;
  skillGatewayUrl: string;
  taskId: string;
  requestTimeoutMs?: number;
}

export interface MastraRemoteSkillWorkspace {
  workspace: Workspace;
  manifest: AgentSkillManifest;
}

export interface MastraRemoteInlineSkills {
  skills: InlineSkill[];
  manifest: AgentSkillManifest;
}

/** Resolve immutable Skill Gateway manifests into Mastra's read-only virtual workspace. */
export async function createMastraRemoteSkillWorkspace(
  config: MastraRemoteSkillConfig,
): Promise<MastraRemoteSkillWorkspace> {
  const manifest = await resolveAgentSkillManifest(config);
  const enabled = manifest.skills.filter((skill) => skill.enabled);
  const blobStore = new SkillGatewayBlobStore(config, manifest);
  const source = new CompositeVersionedSkillSource(
    enabled.map((skill) => ({
      dirName: safeSkillPackageName(skill.name),
      tree: skill.versionTree as SkillVersionTree,
      versionCreatedAt: new Date(),
    })),
    blobStore,
  );
  const workspace = new Workspace({
    id: `remote-skills-${safeId(config.taskId)}`,
    name: `Remote skills for ${config.agentId}`,
    skills: ["."],
    skillSource: source,
  });
  await workspace.init();
  return { workspace, manifest };
}

/**
 * Resolve remote Skill packages into Mastra Agent-level skills.
 *
 * Agent-level skills keep Mastra's skill/skill_search/skill_read tools and
 * multi-file references, but do not attach a Workspace (filesystem, sandbox,
 * command and LSP tools). This is the safer mode for strict JSON/HTML output.
 */
export async function createMastraRemoteInlineSkills(
  config: MastraRemoteSkillConfig,
): Promise<MastraRemoteInlineSkills> {
  const manifest = await resolveAgentSkillManifest(config);
  const blobStore = new SkillGatewayBlobStore(config, manifest);
  const skills = await Promise.all(
    manifest.skills
      .filter((skill) => skill.enabled)
      .map(async (skill) => {
        const entries = skill.versionTree.entries;
        const skillMarkdown = await readSkillEntry(blobStore, entries["SKILL.md"]);
        const parsed = parseSkillMarkdown(skillMarkdown, skill.name);
        const references: Record<string, string> = {};
        for (const [path, entry] of Object.entries(entries)) {
          if (path === "SKILL.md") continue;
          references[path] = await readSkillEntry(blobStore, entry);
        }
        return createSkill({
          name: safeSkillPackageName(skill.name).toLowerCase().slice(0, 64),
          description: parsed.description,
          instructions: parsed.instructions,
          references,
          metadata: {
            source: "skill-gateway",
            version: skill.version,
            digest: skill.digest,
            originalName: skill.name,
          },
        });
      }),
  );
  return { skills, manifest };
}

async function readSkillEntry(
  blobStore: SkillGatewayBlobStore,
  entry: SkillManifestEntry | undefined,
): Promise<string> {
  if (!entry) throw new Error("skill entry is missing from version tree");
  const blob = await blobStore.get(entry.blobHash);
  if (!blob) throw new Error(`skill blob not found: ${entry.blobHash}`);
  return blob.content;
}

function parseSkillMarkdown(
  markdown: string,
  fallbackName: string,
): {
  description: string;
  instructions: string;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      description: `Use the ${fallbackName} skill when it is relevant to the task.`,
      instructions: markdown.trim(),
    };
  }
  const frontmatter = match[1] ?? "";
  const description =
    frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ??
    `Use the ${fallbackName} skill when it is relevant to the task.`;
  return { description, instructions: (match[2] ?? "").trim() };
}

/** Read-only Mastra BlobStore backed by task-bound Skill Gateway download grants. */
export class SkillGatewayBlobStore extends BlobStore {
  private readonly entries = new Map<string, SkillManifestEntry>();
  private readonly cache = new Map<string, Promise<StorageBlobEntry | null>>();
  private grant?: SkillDownloadGrant;

  constructor(
    private readonly config: MastraRemoteSkillConfig,
    private readonly manifest: AgentSkillManifest,
  ) {
    super();
    for (const skill of manifest.skills.filter((entry) => entry.enabled)) {
      for (const entry of Object.values(skill.versionTree.entries)) {
        this.entries.set(entry.blobHash, entry);
      }
    }
  }

  async init(): Promise<void> {}

  async get(hash: string): Promise<StorageBlobEntry | null> {
    if (!this.entries.has(hash)) return null;
    let pending = this.cache.get(hash);
    if (!pending) {
      pending = this.download(hash);
      this.cache.set(hash, pending);
      void pending.catch(() => this.cache.delete(hash));
    }
    return pending;
  }

  async has(hash: string): Promise<boolean> {
    return this.entries.has(hash);
  }

  async getMany(hashes: string[]): Promise<Map<string, StorageBlobEntry>> {
    const values = await Promise.all(
      hashes.map(async (hash) => [hash, await this.get(hash)] as const),
    );
    return new Map(
      values.filter((value): value is readonly [string, StorageBlobEntry] => value[1] !== null),
    );
  }

  async put(_entry: StorageBlobEntry): Promise<void> {
    throw new Error("Skill Gateway BlobStore is read-only");
  }

  async putMany(_entries: StorageBlobEntry[]): Promise<void> {
    throw new Error("Skill Gateway BlobStore is read-only");
  }

  async delete(_hash: string): Promise<boolean> {
    throw new Error("Skill Gateway BlobStore is read-only");
  }

  async dangerouslyClearAll(): Promise<void> {
    throw new Error("Skill Gateway BlobStore is read-only");
  }

  private async download(hash: string): Promise<StorageBlobEntry | null> {
    const expected = this.entries.get(hash);
    if (!expected) return null;
    const grant = await this.ensureGrant();
    const response = await fetch(`${grant.blobBaseUrl.replace(/\/$/, "")}/blobs/${hash}`, {
      headers: { authorization: `Bearer ${grant.downloadToken}` },
      signal: AbortSignal.timeout(this.requestTimeoutMs()),
    });
    if (!response.ok) throw new Error(`skill blob download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== hash || bytes.length !== expected.size) {
      throw new Error(`skill blob integrity check failed: ${hash}`);
    }
    return {
      hash,
      content: expected.encoding === "base64" ? bytes.toString("base64") : bytes.toString("utf8"),
      size: bytes.length,
      ...(expected.mimeType ? { mimeType: expected.mimeType } : {}),
      createdAt: new Date(),
    };
  }

  private async ensureGrant(): Promise<SkillDownloadGrant> {
    if (
      this.grant &&
      Number.isFinite(Date.parse(this.grant.tokenExpiresAt)) &&
      Date.parse(this.grant.tokenExpiresAt) > Date.now() + 5_000
    ) {
      return this.grant;
    }
    const response = await fetch(
      `${this.config.skillGatewayUrl.replace(/\/$/, "")}/skills/grants`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agentId: this.config.agentId,
          taskId: this.config.taskId,
          revision: this.manifest.revision,
          hashes: [...this.entries.keys()],
        }),
        signal: AbortSignal.timeout(this.requestTimeoutMs()),
      },
    );
    if (!response.ok) throw new Error(`skill download grant failed: ${response.status}`);
    const grant = (await response.json()) as SkillDownloadGrant;
    if (
      !grant.blobBaseUrl ||
      !grant.downloadToken ||
      !Number.isFinite(Date.parse(grant.tokenExpiresAt)) ||
      Date.parse(grant.tokenExpiresAt) <= Date.now()
    ) {
      throw new Error("invalid skill download grant response");
    }
    this.grant = grant;
    return grant;
  }

  private requestTimeoutMs(): number {
    return this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }
}

const manifestCache = new Map<string, AgentSkillManifest>();

async function resolveAgentSkillManifest(
  config: MastraRemoteSkillConfig,
): Promise<AgentSkillManifest> {
  const base = config.skillGatewayUrl.replace(/\/$/, "");
  const cacheKey = `${base}:${config.agentId}`;
  const cached = manifestCache.get(cacheKey);
  const headers: Record<string, string> = { authorization: `Bearer ${config.token}` };
  if (cached) headers["if-none-match"] = `"${cached.revision}"`;
  const response = await fetch(`${base}/skills/manifests/${encodeURIComponent(config.agentId)}`, {
    headers,
    signal: AbortSignal.timeout(config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
  });
  if (response.status === 304 && cached) return cached;
  if (!response.ok) throw new Error(`skill manifest fetch failed: ${response.status}`);
  const manifest = normalizeAndValidateManifest(
    (await response.json()) as AgentSkillManifest,
    config.agentId,
  );
  manifestCache.set(cacheKey, manifest);
  return manifest;
}

function normalizeAndValidateManifest(
  manifest: AgentSkillManifest,
  expectedAgentId: string,
): AgentSkillManifest {
  if (
    manifest.agentId !== expectedAgentId ||
    !isSha256(manifest.revision) ||
    !Array.isArray(manifest.skills)
  ) {
    throw new Error("invalid skill manifest response");
  }
  const names = new Set<string>();
  for (const skill of manifest.skills) {
    const directoryName = safeSkillPackageName(skill.name);
    if (!skill.name || names.has(directoryName)) throw new Error("invalid skill manifest entry");
    names.add(directoryName);
    const entries = normalizeSkillEntries(skill.versionTree?.entries ?? {});
    if (!entries["SKILL.md"]) throw new Error(`SKILL.md missing for ${skill.name}`);
    for (const [path, entry] of Object.entries(entries)) {
      if (
        !isSafeRelativePath(path) ||
        !isSha256(entry.blobHash) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 0
      ) {
        throw new Error(`invalid skill manifest file entry: ${path}`);
      }
    }
    const digest = computeSkillDigest(entries);
    if (digest !== skill.digest.replace(/^sha256:/, "").toLowerCase()) {
      throw new Error(`version digest mismatch for ${skill.name}`);
    }
    skill.versionTree = { entries };
    skill.digest = digest;
  }
  return manifest;
}

function normalizeSkillEntries(
  input: Record<string, SkillManifestEntry>,
): Record<string, SkillManifestEntry> {
  const meaningful = Object.entries(input)
    .map(([path, entry]) => [path.replace(/\\/g, "/").replace(/^\/+/, ""), entry] as const)
    .filter(
      ([path]) => !path.split("/").some((part) => part === "__MACOSX" || part === ".DS_Store"),
    );
  const direct = Object.fromEntries(meaningful);
  if (direct["SKILL.md"]) return direct;
  const roots = new Set(meaningful.map(([path]) => path.split("/")[0]));
  if (roots.size !== 1) return direct;
  const root = [...roots][0];
  if (!root || !direct[`${root}/SKILL.md`]) return direct;
  return Object.fromEntries(
    meaningful
      .filter(([path]) => path.startsWith(`${root}/`))
      .map(([path, entry]) => [path.slice(root.length + 1), entry]),
  );
}

function computeSkillDigest(entries: Record<string, SkillManifestEntry>): string {
  const normalized: Record<string, SkillManifestEntry> = {};
  for (const path of Object.keys(entries).sort()) {
    const entry = entries[path];
    if (!entry) continue;
    normalized[path] = {
      blobHash: entry.blobHash,
      size: entry.size,
      ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
      ...(entry.encoding ? { encoding: entry.encoding } : {}),
    };
  }
  return createHash("sha256")
    .update(JSON.stringify({ entries: normalized }))
    .digest("hex");
}

function isSafeRelativePath(path: string): boolean {
  return Boolean(path) && !path.startsWith("/") && !path.split("/").includes("..");
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.replace(/^sha256:/, ""));
}

function safeSkillPackageName(name: string): string {
  const safe = name
    .trim()
    .replace(/^@/, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe || "skill";
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 128) || "task";
}
