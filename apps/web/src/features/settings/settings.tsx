import {
  Button,
  Card,
  Field,
  formatDate,
  Input,
  Select,
  Switch,
  Table,
  Tabs,
  useToast,
} from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type ApiToken, api, type McpConfig } from "../../entities/api.js";

export function SettingsPage() {
  const [tab, setTab] = useState("profile");
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="sg-h1 sg-mb">设置</h1>
      <Tabs
        tabs={[
          { id: "profile", label: "个人与 AI" },
          { id: "team", label: "团队与权限" },
          { id: "mcp", label: "MCP 连接" },
          { id: "tokens", label: "API Token" },
          { id: "git", label: "Git 集成" },
          { id: "domains", label: "自定义域名" },
          { id: "publish", label: "发布" },
          { id: "audit", label: "安全审计" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "profile" && <ProfileSettings />}
      {tab === "team" && <TeamSettings />}
      {tab === "mcp" && <McpSettings />}
      {tab === "tokens" && <TokenSettings />}
      {tab === "git" && <GitSettings />}
      {tab === "domains" && <DomainSettings />}
      {tab === "publish" && <PublishSettings />}
      {tab === "audit" && <AuditLog />}
    </div>
  );
}

interface GitConnection {
  id: string;
  name: string;
  provider: string;
  repo_url: string;
  branch: string;
  sync_path: string;
  local_dir: string | null;
  status: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
}

function GitSettings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<GitConnection[]>({
    queryKey: ["git"],
    queryFn: () => api("/integrations/git"),
  });
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("github");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [syncPath, setSyncPath] = useState("/");
  const [localDir, _setLocalDir] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<GitConnection>("/integrations/git", {
        method: "POST",
        body: { name, provider, repoUrl, branch, syncPath, localDir: localDir || undefined },
      }),
    onSuccess: () => {
      toast("success", "Git 连接已创建");
      setName("");
      setRepoUrl("");
      void queryClient.invalidateQueries({ queryKey: ["git"] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const sync = useMutation({
    mutationFn: (id: string) => api(`/integrations/git/${id}/sync`, { method: "POST" }),
    onSuccess: () => {
      toast("success", "同步任务已创建，文档将导入为资产");
      void queryClient.invalidateQueries({ queryKey: ["git"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/integrations/git/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["git"] }),
  });

  return (
    <div className="sg-col">
      <Card>
        <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="连接名称">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：产品文档仓库"
            />
          </Field>
          <Field label="Provider">
            <Select
              value={provider}
              onChange={setProvider}
              options={[
                { value: "github", label: "GitHub" },
                { value: "gitlab", label: "GitLab" },
                { value: "local", label: "本地目录（演示）" },
              ]}
            />
          </Field>
        </div>
        <Field
          label="仓库地址"
          hint={
            provider === "local"
              ? "本地模式直接填目录路径，无需克隆"
              : "例如 https://github.com/org/docs.git"
          }
        >
          <Input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder={provider === "local" ? "/Users/me/docs" : "https://…"}
          />
        </Field>
        <div className="sg-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="分支">
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
          </Field>
          <Field label="同步路径（仓库内子目录）">
            <Input value={syncPath} onChange={(e) => setSyncPath(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="primary"
          disabled={!name.trim() || !repoUrl.trim()}
          onClick={() => create.mutate()}
        >
          创建连接
        </Button>
      </Card>

      {(data?.length ?? 0) > 0 && (
        <Table>
          <thead>
            <tr>
              <th>名称</th>
              <th>仓库</th>
              <th>分支</th>
              <th>状态</th>
              <th>最近同步</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td style={{ fontSize: 12 }}>{c.repo_url}</td>
                <td>{c.branch}</td>
                <td>{c.status}</td>
                <td className="sg-subtle">
                  {c.last_sync_at ? formatDate(c.last_sync_at) : "-"}
                  {c.last_sync_status && <div style={{ fontSize: 11 }}>{c.last_sync_status}</div>}
                </td>
                <td>
                  <div className="sg-row">
                    <Button size="sm" onClick={() => sync.mutate(c.id)}>
                      同步
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove.mutate(c.id)}>
                      删除
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

interface CustomDomain {
  id: string;
  domain: string;
  verification_token: string;
  status: string;
  verified_at: string | null;
  publish_id: string | null;
}

function DomainSettings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<CustomDomain[]>({
    queryKey: ["domains"],
    queryFn: () => api("/integrations/domains"),
  });
  const { data: publishes } = useQuery<Array<{ id: string; slug: string; assetId: string }>>({
    queryKey: ["publishes"],
    queryFn: () => api("/publishes"),
  });
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<CustomDomain>("/integrations/domains", { method: "POST", body: { domain } }),
    onSuccess: () => {
      toast("success", "域名已添加，请按提示配置 DNS TXT 记录");
      setDomain("");
      void queryClient.invalidateQueries({ queryKey: ["domains"] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const verify = useMutation({
    mutationFn: (id: string) =>
      api(`/integrations/domains/${id}/verify`, { method: "POST", body: { token } }),
    onSuccess: () => {
      toast("success", "域名验证通过");
      setToken("");
      void queryClient.invalidateQueries({ queryKey: ["domains"] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const bind = useMutation({
    mutationFn: ({ id, publishId }: { id: string; publishId: string | null }) =>
      api(`/integrations/domains/${id}/bind`, { method: "POST", body: { publishId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["domains"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/integrations/domains/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["domains"] }),
  });

  return (
    <div className="sg-col">
      <Card>
        <Field label="域名" hint="例如 docs.example.com（需备案/解析至公开网关）">
          <div className="sg-row">
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="docs.example.com"
            />
            <Button variant="primary" disabled={!domain.trim()} onClick={() => create.mutate()}>
              添加
            </Button>
          </div>
        </Field>
      </Card>
      {(data ?? []).map((d) => (
        <Card key={d.id}>
          <div className="sg-row-between">
            <div>
              <strong>{d.domain}</strong>
              <span
                className={`sg-badge ${d.status === "verified" ? "sg-badge-success" : "sg-badge-warning"}`}
              >
                {d.status === "verified" ? "已验证" : "待验证"}
              </span>
            </div>
            <div className="sg-row">
              <Select
                value={d.publish_id ?? ""}
                onChange={(v) => bind.mutate({ id: d.id, publishId: v || null })}
                options={[
                  { value: "", label: "绑定发布内容…" },
                  ...(publishes ?? []).map((p) => ({
                    value: p.id,
                    label: `${p.slug}（${p.assetId}）`,
                  })),
                ]}
                className=""
                style={{ width: 220 }}
              />
              <Button size="sm" variant="danger" onClick={() => remove.mutate(d.id)}>
                删除
              </Button>
            </div>
          </div>
          {d.status !== "verified" && (
            <div className="sg-card sg-mt" style={{ background: "var(--sg-bg-3)" }}>
              <p className="sg-label">添加 DNS TXT 记录：</p>
              <code>{d.verification_token}</code>
              <div className="sg-row sg-mt-sm">
                <Input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="粘贴验证 Token"
                  style={{ maxWidth: 240 }}
                />
                <Button size="sm" variant="primary" onClick={() => verify.mutate(d.id)}>
                  验证
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function TeamSettings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<{
    workspaceId: string;
    ownerSubject: string;
    members: Array<{ subject: string; role: string; created_at: string }>;
  }>({
    queryKey: ["workspace"],
    queryFn: () => api("/workspace"),
  });
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState("viewer");

  const invite = useMutation({
    mutationFn: () => api("/workspace/members", { method: "POST", body: { subject, role } }),
    onSuccess: () => {
      toast("success", "已邀请成员");
      setSubject("");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const updateRole = useMutation({
    mutationFn: ({ subject: s, role: r }: { subject: string; role: string }) =>
      api(`/workspace/members/${s}`, { method: "PATCH", body: { role: r } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });

  const remove = useMutation({
    mutationFn: (s: string) => api(`/workspace/members/${s}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });

  return (
    <Card>
      <h3 className="sg-h3">工作区成员</h3>
      <div className="sg-row sg-mb">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="成员 subject（如 zhangsan）"
          style={{ maxWidth: 220 }}
        />
        <Select
          value={role}
          onChange={setRole}
          options={[
            { value: "admin", label: "管理员" },
            { value: "editor", label: "编辑者" },
            { value: "viewer", label: "查看者" },
          ]}
          className=""
          style={{ width: 120 }}
        />
        <Button
          variant="primary"
          size="sm"
          disabled={!subject.trim()}
          onClick={() => invite.mutate()}
        >
          邀请
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <th>成员</th>
            <th>角色</th>
            <th>加入时间</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{data?.ownerSubject}（所有者）</td>
            <td>owner</td>
            <td>-</td>
            <td></td>
          </tr>
          {(data?.members ?? []).map((m) => (
            <tr key={m.subject}>
              <td>{m.subject}</td>
              <td>
                <Select
                  value={m.role}
                  onChange={(v) => updateRole.mutate({ subject: m.subject, role: v })}
                  options={[
                    { value: "admin", label: "管理员" },
                    { value: "editor", label: "编辑者" },
                    { value: "viewer", label: "查看者" },
                  ]}
                  className=""
                  style={{ width: 110 }}
                />
              </td>
              <td>{formatDate(m.created_at)}</td>
              <td>
                <Button size="sm" variant="danger" onClick={() => remove.mutate(m.subject)}>
                  移除
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="sg-hint">在资产详情页可将资产分享给成员并指定编辑/查看权限。</p>
    </Card>
  );
}

function ProfileSettings() {
  const toast = useToast();
  const { data } = useQuery<{
    profile: {
      name: string;
      defaultQuality: string;
      defaultLanguage: string;
      notifyEmail: boolean;
    };
  }>({
    queryKey: ["me"],
    queryFn: () => api("/me"),
  });
  const [name, setName] = useState("");
  const [quality, setQuality] = useState("balanced");
  const [notify, setNotify] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api("/me", { method: "PATCH", body: { name, defaultQuality: quality, notifyEmail: notify } }),
    onSuccess: () => toast("success", "个人设置已保存"),
  });
  return (
    <Card>
      <Field label="显示名称">
        <Input
          value={name || (data?.profile.name ?? "")}
          onChange={(e) => setName(e.target.value)}
          placeholder={data?.profile.name}
        />
      </Field>
      <Field label="默认 AI 质量模式">
        <Select
          value={quality || (data?.profile.defaultQuality ?? "balanced")}
          onChange={setQuality}
          options={[
            { value: "economy", label: "经济（省 Credits）" },
            { value: "balanced", label: "均衡" },
            { value: "best", label: "最佳" },
          ]}
        />
      </Field>
      <div className="sg-row-between">
        <span>邮件通知（P1）</span>
        <Switch checked={notify || (data?.profile.notifyEmail ?? false)} onChange={setNotify} />
      </div>
      <Button variant="primary" className="sg-mt" onClick={() => save.mutate()}>
        保存
      </Button>
    </Card>
  );
}

function McpSettings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ config: McpConfig; serverUrl: string }>({
    queryKey: ["mcp"],
    queryFn: () => api("/integrations/mcp"),
  });
  const { data: guide } = useQuery<{
    claude: unknown;
    cursor: unknown;
    chatgpt: unknown;
    rawUrl: string;
  }>({
    queryKey: ["mcp-guide"],
    queryFn: () => api("/integrations/mcp/connection-guide"),
    enabled: data?.config.enabled === true,
  });
  const update = useMutation({
    mutationFn: (patch: Partial<McpConfig>) =>
      api("/integrations/mcp", { method: "PATCH", body: patch }),
    onSuccess: () => {
      toast("success", "MCP 配置已更新");
      void queryClient.invalidateQueries({ queryKey: ["mcp"] });
      void queryClient.invalidateQueries({ queryKey: ["mcp-guide"] });
    },
  });
  const config = data?.config;
  return (
    <div className="sg-col">
      <Card>
        <div className="sg-row-between">
          <div>
            <strong>启用 MCP 服务</strong>
            <p className="sg-subtle">
              开启后，Claude / Cursor / ChatGPT 等外部 Agent 可通过 MCP
              协议读取你的知识与资产。默认关闭。
            </p>
          </div>
          <Switch
            checked={config?.enabled ?? false}
            onChange={(v) => update.mutate({ enabled: v })}
          />
        </div>
        {config?.enabled && (
          <>
            <div className="sg-mt">
              <Field label="访问范围">
                <Select
                  value={config.scope}
                  onChange={(v) => update.mutate({ scope: v as McpConfig["scope"] })}
                  options={[
                    { value: "all", label: "全部资产" },
                    { value: "knowledge_bases", label: "指定知识库" },
                    { value: "assets", label: "指定资产" },
                  ]}
                />
              </Field>
            </div>
            <div className="sg-row-between sg-mt">
              <div>
                <strong>写权限</strong>
                <p className="sg-subtle">
                  开启后允许 create_asset / update_asset / create_task /
                  publish_asset（高风险，需二次确认）。
                </p>
              </div>
              <Switch
                checked={config.writeEnabled}
                onChange={(v) => update.mutate({ writeEnabled: v })}
              />
            </div>
            <div className="sg-mt">
              <Field label="服务地址">
                <Input readOnly value={data?.serverUrl ?? ""} onFocus={(e) => e.target.select()} />
              </Field>
            </div>
            <Button
              size="sm"
              variant="danger"
              className="sg-mt"
              onClick={() => update.mutate({ enabled: false })}
            >
              撤销并关闭
            </Button>
          </>
        )}
      </Card>

      {config?.enabled && (
        <Card>
          <h3 className="sg-h3">连接向导</h3>
          <p className="sg-subtle">
            在设置页创建 API Token（读取范围即可），然后用以下配置接入外部 Agent：
          </p>
          <Field label="Cursor / Claude Desktop (mcpServers)">
            <pre
              style={{
                background: "#101625",
                color: "#e6e9f2",
                padding: 14,
                borderRadius: 10,
                overflow: "auto",
                fontSize: 12,
              }}
            >
              {JSON.stringify(guide?.cursor ?? {}, null, 2)}
            </pre>
          </Field>
          <Field label="ChatGPT">
            <pre
              style={{
                background: "#101625",
                color: "#e6e9f2",
                padding: 14,
                borderRadius: 10,
                overflow: "auto",
                fontSize: 12,
              }}
            >
              {JSON.stringify(guide?.chatgpt ?? {}, null, 2)}
            </pre>
          </Field>
        </Card>
      )}
    </div>
  );
}

function TokenSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery<ApiToken[]>({
    queryKey: ["tokens"],
    queryFn: () => api("/integrations/tokens"),
  });
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [created, setCreated] = useState<{ token: ApiToken; secret: string } | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api<{ token: ApiToken; secret: string }>("/integrations/tokens", {
        method: "POST",
        body: { name, scopes: write ? ["read", "write"] : ["read"] },
      }),
    onSuccess: (d) => {
      setCreated(d);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/integrations/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tokens"] }),
  });
  return (
    <Card>
      <Field label="Token 名称">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：Claude Desktop"
        />
      </Field>
      <div className="sg-row-between">
        <span>允许写入（Write）</span>
        <Switch checked={write} onChange={setWrite} />
      </div>
      <Button
        variant="primary"
        className="sg-mt"
        disabled={!name.trim()}
        onClick={() => create.mutate()}
      >
        创建 Token
      </Button>

      {created && (
        <div className="sg-card sg-mt" style={{ background: "var(--sg-bg-3)" }}>
          <strong>Token 已创建（仅显示一次）</strong>
          <Input readOnly value={created.secret} onFocus={(e) => e.target.select()} />
          <p className="sg-hint">请立即复制保存；Token 只存哈希，无法再次查看。</p>
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <th>名称</th>
            <th>权限</th>
            <th>创建时间</th>
            <th>状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.scopes.join(", ")}</td>
              <td>{new Date(t.createdAt).toLocaleDateString("zh-CN")}</td>
              <td>{t.revokedAt ? "已撤销" : "有效"}</td>
              <td>
                {!t.revokedAt && (
                  <Button size="sm" variant="danger" onClick={() => revoke.mutate(t.id)}>
                    撤销
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function PublishSettings() {
  const { data } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ["publishes"],
    queryFn: () => api("/publishes"),
  });
  return (
    <Card>
      <h3 className="sg-h3">已发布内容</h3>
      {(data?.length ?? 0) === 0 ? (
        <p className="sg-subtle">还没有发布内容。在文档 / 演示详情页点击“发布”即可生成稳定 URL。</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>内容</th>
              <th>可见性</th>
              <th>访问量</th>
              <th>链接</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={String(p.id)}>
                <td>{String(p.assetId)}</td>
                <td>{String(p.visibility)}</td>
                <td>{String(p.viewCount ?? 0)}</td>
                <td>
                  <a href={String(p.url)} target="_blank" rel="noreferrer">
                    {String(p.slug)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function AuditLog() {
  const { data } = useQuery<
    Array<{ action: string; resource: string; outcome: string; createdAt: string; actor: string }>
  >({
    queryKey: ["audit"],
    queryFn: () => api("/audit"),
  });
  return (
    <Card>
      <h3 className="sg-h3">高风险操作审计</h3>
      {(data?.length ?? 0) === 0 ? (
        <p className="sg-subtle">暂无审计记录。</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作</th>
              <th>资源</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((a, i) => (
              <tr key={i}>
                <td>{new Date(a.createdAt).toLocaleString("zh-CN")}</td>
                <td>{a.action}</td>
                <td>{a.resource}</td>
                <td>{a.outcome}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
