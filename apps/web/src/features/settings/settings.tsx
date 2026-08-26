import { Field, formatDate, Scrollbar, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Select, Switch, Tabs } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";
import {
  addOrganizationMember,
  fetchOrganizationMembers,
  getAuthSession,
  isWorkspaceAdmin,
  type OrganizationMember,
  type OrganizationRole,
  removeOrganizationMember,
  updateOrganizationMember,
} from "../../auth/session.js";
import { type ApiToken, api, type McpConfig } from "../../entities/api.js";
import { AppTable } from "../../shared/AppTable.js";

const useSettingsStyles = createStyles(({ token }) => ({
  twoColumns: {
    gridTemplateColumns: "1fr 1fr",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  repoUrl: { fontSize: 12 },
  syncStatus: { fontSize: 11 },
  domainSelect: { width: 220 },
  dnsCard: { background: token.colorBgElevated },
  dnsInput: { maxWidth: 240 },
  memberInput: { maxWidth: 260 },
  roleSelect: { width: 120 },
  guideScroll: { maxHeight: 280 },
  guidePre: {
    margin: 0,
    background: "#101625",
    color: "#e6e9f2",
    padding: 14,
    borderRadius: 10,
    fontSize: 12,
  },
  tokenCard: { background: token.colorBgElevated },
}));

export function SettingsPage() {
  const [tab, setTab] = useState("profile");
  const session = getAuthSession();
  const canManageWorkspace = isWorkspaceAdmin(session);
  const tabs = [
    { key: "profile", label: "个人与 AI" },
    { key: "team", label: "团队与权限" },
    ...(canManageWorkspace
      ? [
          { key: "mcp", label: "MCP 连接" },
          { key: "tokens", label: "API Token" },
          { key: "git", label: "Git 集成" },
          { key: "domains", label: "自定义域名" },
          { key: "publish", label: "发布" },
          { key: "audit", label: "安全审计" },
        ]
      : []),
  ];
  return (
    <div>
      <h1 className="sg-h1 sg-mb">设置</h1>
      <Tabs items={tabs} activeKey={tab} onChange={setTab} />
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
  const { styles } = useSettingsStyles();
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
        <div className={`sg-grid ${styles.twoColumns}`}>
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
        <div className={`sg-grid ${styles.twoColumns}`}>
          <Field label="分支">
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
          </Field>
          <Field label="同步路径（仓库内子目录）">
            <Input value={syncPath} onChange={(e) => setSyncPath(e.target.value)} />
          </Field>
        </div>
        <Button
          type="primary"
          disabled={!name.trim() || !repoUrl.trim()}
          onClick={() => create.mutate()}
        >
          创建连接
        </Button>
      </Card>

      {(data?.length ?? 0) > 0 && (
        <AppTable<GitConnection>
          rowKey="id"
          dataSource={data ?? []}
          pagination={false}
          size="middle"
          columns={[
            { title: "名称", dataIndex: "name" },
            {
              title: "仓库",
              dataIndex: "repo_url",
              render: (v) => <span className={styles.repoUrl}>{v}</span>,
            },
            { title: "分支", dataIndex: "branch" },
            { title: "状态", dataIndex: "status" },
            {
              title: "最近同步",
              key: "lastSync",
              render: (_v, c) => (
                <>
                  {c.last_sync_at ? formatDate(c.last_sync_at) : "-"}
                  {c.last_sync_status && (
                    <div className={styles.syncStatus}>{c.last_sync_status}</div>
                  )}
                </>
              ),
            },
            {
              title: "操作",
              key: "actions",
              render: (_v, c) => (
                <div className="sg-row">
                  <Button size="small" onClick={() => sync.mutate(c.id)}>
                    同步
                  </Button>
                  <Button size="small" type="primary" danger onClick={() => remove.mutate(c.id)}>
                    删除
                  </Button>
                </div>
              ),
            },
          ]}
        />
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
  const { styles } = useSettingsStyles();
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
            <Button type="primary" disabled={!domain.trim()} onClick={() => create.mutate()}>
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
                className={styles.domainSelect}
              />
              <Button size="small" type="primary" danger onClick={() => remove.mutate(d.id)}>
                删除
              </Button>
            </div>
          </div>
          {d.status !== "verified" && (
            <div className={`sg-card sg-mt ${styles.dnsCard}`}>
              <p className="sg-label">添加 DNS TXT 记录：</p>
              <code>{d.verification_token}</code>
              <div className="sg-row sg-mt-sm">
                <Input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="粘贴验证 Token"
                  className={styles.dnsInput}
                />
                <Button size="small" type="primary" onClick={() => verify.mutate(d.id)}>
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
  const { styles } = useSettingsStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const session = getAuthSession();
  const organizationId = session?.tenantType === "org" ? session.tenantId : null;
  const canManage = isWorkspaceAdmin(session);
  const { data, isLoading, error } = useQuery<OrganizationMember[]>({
    queryKey: ["organization-members", organizationId],
    queryFn: () => fetchOrganizationMembers(organizationId as string),
    enabled: Boolean(organizationId && !session?.localBroker),
  });
  const [loginName, setLoginName] = useState("");
  const [role, setRole] = useState<OrganizationRole>("org:viewer");

  const invite = useMutation({
    mutationFn: () => addOrganizationMember(organizationId as string, loginName.trim(), role),
    onSuccess: () => {
      toast("success", "已邀请成员");
      setLoginName("");
      void queryClient.invalidateQueries({ queryKey: ["organization-members", organizationId] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, nextRole }: { userId: string; nextRole: OrganizationRole }) =>
      updateOrganizationMember(organizationId as string, userId, nextRole),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["organization-members", organizationId] }),
    onError: (e: Error) => toast("error", e.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(organizationId as string, userId),
    onSuccess: () => {
      toast("success", "成员已移除");
      void queryClient.invalidateQueries({ queryKey: ["organization-members", organizationId] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  if (!session || !organizationId) {
    return (
      <Card>
        <h3 className="sg-h3">Group 与权限</h3>
        <p className="sg-hint">当前是个人空间。请先在 Header 切换到 Group 空间后管理成员。</p>
      </Card>
    );
  }

  if (session?.localBroker) {
    return (
      <Card>
        <h3 className="sg-h3">Group 与权限</h3>
        <p className="sg-hint">
          本地 Broker 的账号和空间由环境配置托管，成员管理与空间切换仅在正常 OAuth 会话中开放。
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="sg-h3">Group 成员</h3>
      <p className="sg-hint sg-mb">
        {session.organizationName ?? "当前 Group"} · {workspaceRoleLabel(session.roles)}
      </p>
      {canManage && (
        <div className="sg-row sg-mb">
          <Input
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            placeholder="成员登录账号"
            className={styles.memberInput}
          />
          <Select
            value={role}
            onChange={(value) => setRole(value as OrganizationRole)}
            options={ORGANIZATION_ROLE_OPTIONS}
            className={styles.roleSelect}
          />
          <Button
            type="primary"
            size="small"
            disabled={!loginName.trim() || invite.isPending}
            onClick={() => invite.mutate()}
          >
            邀请
          </Button>
        </div>
      )}
      {error && <p className="sg-hint">{error.message}</p>}
      {isLoading && <p className="sg-hint">正在加载成员…</p>}
      <AppTable<OrganizationMember>
        rowKey="userId"
        dataSource={data ?? []}
        pagination={false}
        size="middle"
        columns={[
          {
            title: "成员",
            key: "member",
            render: (_v, member) => {
              const _memberRole = organizationRole(member.roles);
              return (
                <>
                  <strong>{member.displayName || member.loginName}</strong>
                  <div className="sg-hint">{member.loginName}</div>
                </>
              );
            },
          },
          {
            title: "角色",
            key: "role",
            render: (_v, member) => {
              const memberRole = organizationRole(member.roles);
              return canManage ? (
                <Select
                  value={memberRole}
                  onChange={(nextRole) =>
                    updateRole.mutate({
                      userId: member.userId,
                      nextRole: nextRole as OrganizationRole,
                    })
                  }
                  options={ORGANIZATION_ROLE_OPTIONS}
                  className={styles.roleSelect}
                />
              ) : (
                ORGANIZATION_ROLE_OPTIONS.find((option) => option.value === memberRole)?.label
              );
            },
          },
          {
            title: "操作",
            key: "actions",
            render: (_v, member) =>
              canManage || member.userId === session.id ? (
                <Button
                  size="small"
                  type="primary"
                  danger
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(member.userId)}
                >
                  {member.userId === session.id ? "退出" : "移除"}
                </Button>
              ) : null,
          },
        ]}
      />
      <p className="sg-hint">成员身份由统一账号服务管理；资产分享权限仍可在资产详情中单独收敛。</p>
    </Card>
  );
}

const ORGANIZATION_ROLE_OPTIONS: Array<{ value: OrganizationRole; label: string }> = [
  { value: "org:admin", label: "管理员" },
  { value: "org:member", label: "成员" },
  { value: "org:viewer", label: "只读" },
];

function organizationRole(roles: OrganizationRole[]): OrganizationRole {
  return (
    roles.find((role) => ORGANIZATION_ROLE_OPTIONS.some((option) => option.value === role)) ??
    "org:viewer"
  );
}

function workspaceRoleLabel(roles: string[]): string {
  if (roles.includes("org:admin")) return "管理员";
  if (roles.includes("org:member")) return "成员";
  return "只读成员";
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
            { value: "economy", label: "经济" },
            { value: "balanced", label: "均衡" },
            { value: "best", label: "最佳" },
          ]}
        />
      </Field>
      <div className="sg-row-between">
        <span>邮件通知（P1）</span>
        <Switch checked={notify || (data?.profile.notifyEmail ?? false)} onChange={setNotify} />
      </div>
      <Button type="primary" className="sg-mt" onClick={() => save.mutate()}>
        保存
      </Button>
    </Card>
  );
}

function McpSettings() {
  const { styles } = useSettingsStyles();
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
    enabled: data?.config?.enabled === true,
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
              size="small"
              type="primary"
              danger
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
            <Scrollbar className={styles.guideScroll}>
              <pre className={styles.guidePre}>{JSON.stringify(guide?.cursor ?? {}, null, 2)}</pre>
            </Scrollbar>
          </Field>
          <Field label="ChatGPT">
            <Scrollbar className={styles.guideScroll}>
              <pre className={styles.guidePre}>{JSON.stringify(guide?.chatgpt ?? {}, null, 2)}</pre>
            </Scrollbar>
          </Field>
        </Card>
      )}
    </div>
  );
}

function TokenSettings() {
  const { styles } = useSettingsStyles();
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
        type="primary"
        className="sg-mt"
        disabled={!name.trim()}
        onClick={() => create.mutate()}
      >
        创建 Token
      </Button>

      {created && (
        <div className={`sg-card sg-mt ${styles.tokenCard}`}>
          <strong>Token 已创建（仅显示一次）</strong>
          <Input readOnly value={created.secret} onFocus={(e) => e.target.select()} />
          <p className="sg-hint">请立即复制保存；Token 只存哈希，无法再次查看。</p>
        </div>
      )}

      <AppTable<ApiToken>
        rowKey="id"
        dataSource={data ?? []}
        pagination={false}
        size="middle"
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "权限", dataIndex: "scopes", render: (v) => v.join(", ") },
          {
            title: "创建时间",
            dataIndex: "createdAt",
            render: (v) => new Date(v).toLocaleDateString("zh-CN"),
          },
          { title: "状态", dataIndex: "revokedAt", render: (v) => (v ? "已撤销" : "有效") },
          {
            title: "操作",
            key: "actions",
            render: (_v, t) =>
              !t.revokedAt ? (
                <Button size="small" type="primary" danger onClick={() => revoke.mutate(t.id)}>
                  撤销
                </Button>
              ) : null,
          },
        ]}
      />
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
        <AppTable<Record<string, unknown>>
          rowKey={(_, i) => String(i)}
          dataSource={data ?? []}
          pagination={false}
          size="middle"
          columns={[
            { title: "内容", dataIndex: "assetId", render: (v) => String(v) },
            { title: "可见性", dataIndex: "visibility", render: (v) => String(v) },
            { title: "访问量", dataIndex: "viewCount", render: (v) => String(v ?? 0) },
            {
              title: "链接",
              dataIndex: "slug",
              key: "link",
              render: (_v, p) => (
                <a href={String(p.url)} target="_blank" rel="noreferrer">
                  {String(p.slug)}
                </a>
              ),
            },
          ]}
        />
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
        <AppTable<{
          action: string;
          resource: string;
          outcome: string;
          createdAt: string;
          actor: string;
        }>
          rowKey={(_, i) => String(i)}
          dataSource={data ?? []}
          pagination={false}
          size="middle"
          columns={[
            {
              title: "时间",
              dataIndex: "createdAt",
              render: (v) => new Date(v).toLocaleString("zh-CN"),
            },
            { title: "操作", dataIndex: "action" },
            { title: "资源", dataIndex: "resource" },
            { title: "结果", dataIndex: "outcome" },
          ]}
        />
      )}
    </Card>
  );
}
