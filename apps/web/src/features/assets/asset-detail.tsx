import {
  Button,
  Card,
  Empty,
  formatDate,
  Modal,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Tag,
  useToast,
} from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { type Asset, api, type KnowledgeBase, type Publish } from "../../entities/api.js";
import { Markdown } from "../../shared/markdown.js";
import { SandboxHtmlPreview } from "../../shared/sandbox-preview.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("content");
  const [kbModal, setKbModal] = useState(false);
  const [kbId, setKbId] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);

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
    Array<{ relation: { relationType: string; targetAssetId: string }; asset: Asset | null }>
  >({
    queryKey: ["asset-relations", id],
    queryFn: () => api(`/assets/${id}/relations`),
    enabled: Boolean(id),
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

  const deleteAsset = useMutation({
    mutationFn: () => api(`/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("success", "已移入回收站");
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      navigate("/assets");
    },
  });

  if (!asset) return <Empty title="加载中…" />;
  const published = publishes?.find((p) => p.assetId === asset.id && p.status === "active");
  const content = asset.content;

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <Link to="/assets" className="sg-subtle">
            ← 资产中心
          </Link>
          <h1 className="sg-h1" style={{ marginTop: 6 }}>
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
          {asset.type === "document" || asset.type === "report" ? (
            <Button onClick={() => navigate(`/documents/${asset.id}`)}>编辑</Button>
          ) : null}
          {asset.type === "html" ? (
            <Button onClick={() => navigate(`/html/${asset.id}`)}>编辑</Button>
          ) : null}
          {asset.type === "presentation" ? (
            <Button onClick={() => navigate(`/presentations/${asset.id}`)}>编辑</Button>
          ) : null}
          {asset.type === "dataset" ? (
            <Button onClick={() => navigate(`/datasets/${asset.id}`)}>打开数据</Button>
          ) : null}
          <Button onClick={() => setKbModal(true)}>加入知识库</Button>
          <Button onClick={() => navigate(`/presentations/new?asset=${asset.id}`)}>生成演示</Button>
          {published ? (
            <Button variant="primary" onClick={() => setPublishOpen(true)}>
              发布设置
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setPublishOpen(true)}>
              发布
            </Button>
          )}
          <Button variant="danger" onClick={() => deleteAsset.mutate()}>
            删除
          </Button>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "content", label: "内容" },
          { id: "info", label: "信息" },
          { id: "versions", label: "版本" },
          { id: "relations", label: "关系" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "content" && (
        <Card>
          {content?.kind === "markdown" || asset.type === "report" ? (
            <Markdown source={content?.text ?? ""} />
          ) : content?.kind === "html" ? (
            <SandboxHtmlPreview source={content?.text ?? ""} />
          ) : content?.kind === "manifest" ? (
            <pre style={{ overflow: "auto", fontSize: 12 }}>
              {JSON.stringify(content.manifest, null, 2)}
            </pre>
          ) : (
            <Empty title="没有内容" />
          )}
        </Card>
      )}

      {tab === "info" && (
        <Card>
          <Table>
            <tbody>
              <tr>
                <td>ID</td>
                <td>
                  <code>{asset.id}</code>
                </td>
              </tr>
              <tr>
                <td>类型</td>
                <td>{asset.type}</td>
              </tr>
              <tr>
                <td>可见性</td>
                <td>{asset.visibility}</td>
              </tr>
              <tr>
                <td>来源</td>
                <td>{asset.sourceType}</td>
              </tr>
              <tr>
                <td>创建时间</td>
                <td>{formatDate(asset.createdAt)}</td>
              </tr>
              <tr>
                <td>更新时间</td>
                <td>{formatDate(asset.updatedAt)}</td>
              </tr>
              <tr>
                <td>版本号</td>
                <td>v{asset.lockVersion}</td>
              </tr>
              <tr>
                <td>当前版本</td>
                <td>
                  <code>{asset.currentVersionId}</code>
                </td>
              </tr>
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "versions" && (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>版本</th>
                <th>变更类型</th>
                <th>时间</th>
                <th>内容哈希</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(versions ?? []).map((v) => (
                <tr key={v.id}>
                  <td>v{v.sequence}</td>
                  <td>{v.changeKind}</td>
                  <td>{formatDate(v.createdAt)}</td>
                  <td>
                    <code style={{ fontSize: 11 }}>{v.contentHash.slice(0, 18)}…</code>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      onClick={() =>
                        api(`/assets/${id}/versions/${v.id}/restore`, { method: "POST" }).then(() =>
                          toast("success", "已恢复该版本"),
                        )
                      }
                    >
                      恢复
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "relations" && (
        <Card>
          {(relations?.length ?? 0) === 0 ? (
            <Empty title="暂无关联" hint="由文档生成演示、报告引用来源等操作会在这里建立关系。" />
          ) : (
            <div className="sg-col">
              {relations?.map(({ relation, asset: target }) => (
                <div key={relation.targetAssetId} className="sg-row-between">
                  <div className="sg-row">
                    <span className="sg-badge sg-badge-accent">{relation.relationType}</span>
                    <strong>{target?.title ?? relation.targetAssetId}</strong>
                    {target && <span className="sg-subtle">{target.type}</span>}
                  </div>
                  {target && (
                    <Button
                      size="sm"
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

      <Modal
        open={kbModal}
        onClose={() => setKbModal(false)}
        title="加入知识库"
        footer={
          <Button variant="primary" disabled={!kbId} onClick={() => addToKb.mutate(kbId)}>
            加入
          </Button>
        }
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

      {publishOpen && <PublishDialog asset={asset} open onClose={() => setPublishOpen(false)} />}
    </div>
  );
}
