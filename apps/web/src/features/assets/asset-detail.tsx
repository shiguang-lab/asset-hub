import { Empty, Field, formatDate, Scrollbar, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Modal, Select, Switch, Tabs, Tag } from "antd";
import { Download, FilePenLine, Pencil } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { canWriteWorkspace, getAuthSession, isWorkspaceAdmin } from "../../auth/session.js";
import {
  type Asset,
  api,
  downloadFile,
  type KnowledgeBase,
  type Publish,
} from "../../entities/api.js";
import { AppTable } from "../../shared/AppTable.js";
import { DocumentMarkdown } from "../../shared/document-markdown.js";
import { SandboxHtmlPreview } from "../../shared/sandbox-preview.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";
import { PublishDialog } from "../publishing/publish-dialog.js";
import { assetContentEditorHref } from "./asset-edit.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("content");
  const [kbModal, setKbModal] = useState(false);
  const [kbId, setKbId] = useState("");
  const [shareModal, setShareModal] = useState(false);
  const [shareSubject, setShareSubject] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [publishOpen, setPublishOpen] = useState(false);
  const session = getAuthSession();
  const workspaceWritable = canWriteWorkspace(session);
  const workspaceAdmin = isWorkspaceAdmin(session);

  const { data: asset } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`),
  });
  const { data: versions } = useQuery<
    Array<{
      id: string;
      sequence: number;
      changeKind: string;
      createdAt: string;
      contentHash: string;
    }>
  >({
    queryKey: ["asset-versions", id],
    queryFn: () => api(`/assets/${id}/versions`),
    enabled: Boolean(id),
  });
  const { data: relations } = useQuery<
    Array<{
      relation: { relationType: string; targetAssetId: string };
      asset: Asset | null;
      direction: "in" | "out";
    }>
  >({
    queryKey: ["asset-relations", id],
    queryFn: () => api(`/assets/${id}/relations`),
    enabled: Boolean(id),
  });
  const { data: acl } = useQuery<{ acl: Array<{ principal_id: string; role: string }> }>({
    queryKey: ["asset-acl", id],
    queryFn: () => api(`/assets/${id}/acl`),
    enabled: Boolean(id && (workspaceAdmin || asset?.ownerSubject === session?.id)),
  });
  const { data: kbs } = useQuery<KnowledgeBase[]>({
    queryKey: ["knowledge"],
    queryFn: () => api<KnowledgeBase[]>("/knowledge-bases"),
    enabled: kbModal,
  });
  const { data: publishes } = useQuery<Publish[]>({
    queryKey: ["publishes"],
    queryFn: () => api<Publish[]>("/publishes"),
  });

  const addToKb = useMutation({
    mutationFn: (kb: string) =>
      api(`/knowledge-bases/${kb}/sources`, {
        method: "POST",
        body: { sourceType: "asset", assetId: id },
      }),
    onSuccess: () => {
      toast("success", "已加入知识库，后台开始索引");
      setKbModal(false);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const share = useMutation({
    mutationFn: () =>
      api(`/assets/${id}/share`, {
        method: "POST",
        body: { subject: shareSubject, role: shareRole },
      }),
    onSuccess: () => {
      toast("success", "已分享给成员");
      setShareModal(false);
      setShareSubject("");
      void queryClient.invalidateQueries({ queryKey: ["asset-acl", id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const revokeShare = useMutation({
    mutationFn: (subject: string) => api(`/assets/${id}/acl/${subject}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("success", "已取消分享");
      void queryClient.invalidateQueries({ queryKey: ["asset-acl", id] });
    },
  });

  const toggleVisibility = useMutation({
    mutationFn: (visibility: "private" | "public") =>
      api<Asset>(`/assets/${id}`, { method: "PATCH", body: { visibility } }),
    onSuccess: (updated) => {
      toast("success", updated.visibility === "public" ? "资产已设为公开" : "资产已设为私有");
      void queryClient.invalidateQueries({ queryKey: ["asset", id] });
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (error: Error) => toast("error", error.message),
  });

  const deleteAsset = useMutation({
    mutationFn: () => api(`/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("success", "已移入回收站");
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      navigate("/assets");
    },
  });

  if (!asset) return <Empty title="加载中…" />;
  const canManageAsset = workspaceAdmin || asset.ownerSubject === session?.id;
  const published = publishes?.find((p) => p.assetId === asset.id && p.status === "active");
  const content = asset.content;
  const contentEditorHref = assetContentEditorHref(asset);

  return (
    <div className="sg-asset-detail-page">
      <div className="sg-row-between sg-mb sg-asset-detail-header">
        <div>
          <h1 className="sg-h1" style={{ marginTop: 0 }}>
            {asset.title}
          </h1>
          <div className="sg-row sg-mt-sm">
            <StatusBadge status={asset.status} />
            <Tag>{asset.type}</Tag>
            {asset.tags.map((t) => (
              <Tag key={t}>#{t}</Tag>
            ))}
          </div>
        </div>
        <div className="sg-row">
          {canManageAsset ? (
            <span className="sg-row" title="独立控制资产本身的公有/私有状态">
              <span className="sg-subtle">{asset.visibility === "public" ? "公开" : "私有"}</span>
              <Switch
                checked={asset.visibility === "public"}
                checkedChildren="公开"
                unCheckedChildren="私有"
                loading={toggleVisibility.isPending}
                onChange={(checked) => toggleVisibility.mutate(checked ? "public" : "private")}
              />
            </span>
          ) : null}
          {workspaceWritable ? (
            <Button
              icon={<Pencil size={15} />}
              onClick={() => navigate(`/assets/${asset.id}/edit`)}
            >
              编辑资产
            </Button>
          ) : null}
          {workspaceWritable && contentEditorHref ? (
            <Button icon={<FilePenLine size={15} />} onClick={() => navigate(contentEditorHref)}>
              编辑内容
            </Button>
          ) : null}
          {asset.type === "file" ? (
            <Button
              type="primary"
              onClick={() =>
                void downloadFile(`/assets/${asset.id}/download`, asset.title).catch((error) =>
                  toast("error", error instanceof Error ? error.message : "下载失败"),
                )
              }
            >
              <Download size={15} /> 下载文件
            </Button>
          ) : null}
          {["document", "report", "html", "presentation", "dataset"].includes(asset.type) ? (
            <Button
              onClick={() =>
                void downloadFile(`/assets/${asset.id}/download`, asset.title).catch((error) =>
                  toast("error", error instanceof Error ? error.message : "下载失败"),
                )
              }
            >
              <Download size={15} /> 下载
            </Button>
          ) : null}
          {workspaceWritable && <Button onClick={() => setKbModal(true)}>加入知识库</Button>}
          {canManageAsset && <Button onClick={() => setShareModal(true)}>分享</Button>}
          {workspaceWritable && (
            <Button onClick={() => navigate(`/presentations/new?asset=${asset.id}`)}>
              生成演示
            </Button>
          )}
          {canManageAsset &&
            (published ? (
              <Button type="primary" onClick={() => setPublishOpen(true)}>
                发布设置
              </Button>
            ) : (
              <Button type="primary" onClick={() => setPublishOpen(true)}>
                发布
              </Button>
            ))}
          {canManageAsset && (
            <Button
              type="primary"
              danger
              onClick={() =>
                confirmDelete({
                  title: `删除资产「${asset.title}」？`,
                  content: "删除后可在回收站恢复。",
                  onConfirm: () => deleteAsset.mutate(),
                })
              }
            >
              删除
            </Button>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { key: "content", label: "内容" },
          { key: "info", label: "信息" },
          { key: "versions", label: "版本" },
          { key: "relations", label: "关系" },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

      <div className="sg-asset-detail-content">
        {tab === "content" && (
          <Card>
            {content?.kind === "blob" || asset.type === "file" ? (
              <div className="sg-col" style={{ gap: 10 }}>
                <strong>{asset.title}</strong>
                <span className="sg-subtle">
                  {content?.refs?.[0]?.mediaType ?? "application/octet-stream"}
                  {content?.refs?.[0]?.size !== undefined
                    ? ` · ${formatBytes(content.refs[0].size)}`
                    : ""}
                </span>
                <Button
                  type="primary"
                  onClick={() =>
                    void downloadFile(`/assets/${asset.id}/download`, asset.title).catch((error) =>
                      toast("error", error instanceof Error ? error.message : "下载失败"),
                    )
                  }
                >
                  <Download size={15} /> 下载文件
                </Button>
              </div>
            ) : content?.kind === "markdown" || asset.type === "report" ? (
              <DocumentMarkdown source={content?.text ?? ""} />
            ) : content?.kind === "html" ? (
              <SandboxHtmlPreview source={content?.text ?? ""} />
            ) : content?.kind === "manifest" ? (
              <Scrollbar>
                <pre style={{ fontSize: 12 }}>{JSON.stringify(content.manifest, null, 2)}</pre>
              </Scrollbar>
            ) : (
              <Empty title="没有内容" />
            )}
          </Card>
        )}

        {tab === "info" && (
          <Card>
            <AppTable<{ key: string; value: React.ReactNode }>
                rowKey="key"
                dataSource={(() => {
                  const rows: { key: string; value: React.ReactNode }[] = [
                    { key: "ID", value: <code>{asset.id}</code> },
                    { key: "类型", value: asset.type },
                    { key: "可见性", value: asset.visibility },
                    { key: "来源", value: asset.sourceType },
                    { key: "创建时间", value: formatDate(asset.createdAt) },
                    { key: "更新时间", value: formatDate(asset.updatedAt) },
                    { key: "版本号", value: `v${asset.lockVersion}` },
                    { key: "当前版本", value: <code>{asset.currentVersionId}</code> },
                  ];
                  if (canManageAsset) {
                    rows.push({
                      key: "共享权限",
                      value:
                        (acl?.acl.length ?? 0) === 0 ? (
                          <span className="sg-subtle">仅所有者可见</span>
                        ) : (
                          <div className="sg-col" style={{ gap: 4 }}>
                            {acl?.acl.map((entry) => (
                              <div key={entry.principal_id} className="sg-row">
                                <span className="sg-badge">{entry.principal_id}</span>
                                <span className="sg-badge sg-badge-accent">{entry.role}</span>
                                <Button
                                  size="small"
                                  type="primary"
                                  danger
                                  onClick={() => revokeShare.mutate(entry.principal_id)}
                                >
                                  取消
                                </Button>
                              </div>
                            ))}
                          </div>
                        ),
                    });
                  }
                  return rows;
                })()}
                pagination={false}
                size="middle"
                showHeader={false}
                columns={[
                  { title: "", dataIndex: "key", width: 120 },
                  { title: "", dataIndex: "value" },
                ]}
              />
          </Card>
        )}

        {tab === "versions" && (
          <Card>
            <AppTable<{ id: string; sequence: number; changeKind: string; createdAt: string; contentHash: string }>
                rowKey="id"
                dataSource={versions ?? []}
                pagination={false}
                size="middle"
                columns={[
                  { title: "版本", dataIndex: "sequence", render: (v) => `v${v}` },
                  { title: "变更类型", dataIndex: "changeKind" },
                  { title: "时间", dataIndex: "createdAt", render: (v) => formatDate(v) },
                  {
                    title: "内容哈希",
                    dataIndex: "contentHash",
                    render: (v) => <code style={{ fontSize: 11 }}>{v.slice(0, 18)}…</code>,
                  },
                  {
                    title: "操作",
                    key: "actions",
                    render: (_v, v) =>
                      canManageAsset ? (
                        <Button
                          size="small"
                          onClick={() =>
                            api(`/assets/${id}/versions/${v.id}/restore`, { method: "POST" }).then(
                              () => toast("success", "已恢复该版本"),
                            )
                          }
                        >
                          恢复
                        </Button>
                      ) : null,
                  },
                ]}
              />
          </Card>
        )}

        {tab === "relations" && (
          <Card>
            {(relations?.length ?? 0) === 0 ? (
              <Empty title="暂无关联" hint="由文档生成演示、报告引用来源等操作会在这里建立关系。" />
            ) : (
              <div className="sg-col">
                {relations?.map(({ relation, asset: target, direction }) => (
                  <div key={relation.targetAssetId} className="sg-row-between">
                    <div className="sg-row">
                      <span className={`sg-badge ${direction === "out" ? "" : "sg-badge-success"}`}>
                        {direction === "out" ? "→ 输出" : "← 来源"}
                      </span>
                      <span className="sg-badge sg-badge-accent">{relation.relationType}</span>
                      <strong>{target?.title ?? relation.targetAssetId}</strong>
                      {target && <span className="sg-subtle">{target.type}</span>}
                    </div>
                    {target && (
                      <Button
                        size="small"
                        onClick={() => {
                          const href =
                            target.type === "document" || target.type === "report"
                              ? `/documents/${target.id}`
                              : target.type === "dataset"
                                ? `/datasets/${target.id}`
                                : target.type === "presentation"
                                  ? `/presentations/${target.id}`
                                  : `/assets/${target.id}`;
                          navigate(href);
                        }}
                      >
                        打开
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal
        open={kbModal}
        onCancel={() => setKbModal(false)}
        title="加入知识库"
        footer={
          <Button type="primary" disabled={!kbId} onClick={() => addToKb.mutate(kbId)}>
            加入
          </Button>
        }
        destroyOnHidden
      >
        <Select
          value={kbId}
          onChange={setKbId}
          options={[
            { value: "", label: "选择知识库…" },
            ...(kbs ?? []).map((kb) => ({
              value: kb.id,
              label: `${kb.name}（${kb.sourceCount} 来源）`,
            })),
          ]}
        />
      </Modal>

      <Modal
        open={shareModal}
        onCancel={() => setShareModal(false)}
        title="分享给工作区成员"
        footer={
          <Button type="primary" disabled={!shareSubject.trim()} onClick={() => share.mutate()}>
            分享
          </Button>
        }
        destroyOnHidden
      >
        <div className="sg-col">
          <Field label="成员 subject">
            <Input
              value={shareSubject}
              onChange={(e) => setShareSubject(e.target.value)}
              placeholder="例如 zhangsan"
            />
          </Field>
          <Field label="权限">
            <Select
              value={shareRole}
              onChange={setShareRole}
              options={[
                { value: "viewer", label: "查看" },
                { value: "editor", label: "编辑" },
              ]}
            />
          </Field>
          <p className="sg-hint">分享后资产可见性自动切换为"链接"，成员会收到站内通知。</p>
        </div>
      </Modal>

      {publishOpen && <PublishDialog asset={asset} open onClose={() => setPublishOpen(false)} />}
    </div>
  );
}
