import { Empty, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Segmented, Select, Tag } from "antd";
import { ArrowLeft, FilePenLine, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { canWriteWorkspace, getAuthSession } from "../../auth/session.js";
import { type Asset, api } from "../../entities/api.js";
import { useShellBreadcrumb } from "../../shell/layout.js";

type AssetVisibility = "private" | "link" | "public";

const VISIBILITY_OPTIONS = [
  { label: "私有", value: "private" },
  { label: "链接可见", value: "link" },
  { label: "公开", value: "public" },
];

export function AssetEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<AssetVisibility>("private");

  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ["asset", id],
    queryFn: () => api<Asset>(`/assets/${id}`),
    enabled: Boolean(id),
  });

  useShellBreadcrumb("资产", asset?.title ?? "编辑资产");

  useEffect(() => {
    if (!asset) return;
    setTitle(asset.title);
    setDescription(asset.description ?? "");
    setTags(asset.tags ?? []);
    if (
      asset.visibility === "private" ||
      asset.visibility === "link" ||
      asset.visibility === "public"
    ) {
      setVisibility(asset.visibility);
    }
  }, [asset]);

  const saveAsset = useMutation({
    mutationFn: () =>
      api<Asset>(`/assets/${id}`, {
        method: "PATCH",
        body: {
          title: title.trim(),
          description: description.trim(),
          tags: tags.map((tag) => tag.trim()).filter(Boolean),
          visibility,
        },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["asset", id], (current: Asset | undefined) => ({
        ...(current ?? updated),
        ...updated,
      }));
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast("success", "资产信息已保存");
      navigate(`/assets/${updated.id}`);
    },
    onError: (error: Error) => toast("error", error.message),
  });

  if (isLoading || !asset) return <Empty title="加载中…" />;
  if (!canWriteWorkspace(getAuthSession())) {
    return (
      <Empty
        title="没有编辑权限"
        action={<Button onClick={() => navigate(`/assets/${asset.id}`)}>返回资产详情</Button>}
      />
    );
  }

  const contentHref = assetContentEditorHref(asset);
  const canSave = title.trim().length > 0 && !saveAsset.isPending;

  return (
    <div className="sg-asset-edit-page">
      <div className="sg-row-between sg-asset-edit-header">
        <div className="sg-row" style={{ minWidth: 0 }}>
          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            aria-label="返回资产详情"
            onClick={() => navigate(`/assets/${asset.id}`)}
          />
          <div style={{ minWidth: 0 }}>
            <h1 className="sg-h1" style={{ margin: 0 }}>
              编辑资产
            </h1>
            <div className="sg-row sg-mt-sm">
              <Tag>{asset.type}</Tag>
              <span className="sg-subtle">{asset.id}</span>
            </div>
          </div>
        </div>
        <div className="sg-row">
          {contentHref ? (
            <Button icon={<FilePenLine size={15} />} onClick={() => navigate(contentHref)}>
              编辑内容
            </Button>
          ) : null}
          <Button
            type="primary"
            icon={<Save size={15} />}
            disabled={!canSave}
            loading={saveAsset.isPending}
            onClick={() => saveAsset.mutate()}
          >
            保存
          </Button>
        </div>
      </div>

      <section className="sg-asset-edit-form" aria-label="资产信息">
        <div className="sg-field">
          <label className="sg-label" htmlFor="asset-edit-title">
            名称
          </label>
          <Input
            id="asset-edit-title"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="sg-field">
          <label className="sg-label" htmlFor="asset-edit-description">
            描述
          </label>
          <Input.TextArea
            id="asset-edit-description"
            value={description}
            rows={5}
            maxLength={2000}
            showCount
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="sg-field">
          <label className="sg-label" htmlFor="asset-edit-tags">
            标签
          </label>
          <Select
            id="asset-edit-tags"
            mode="tags"
            value={tags}
            tokenSeparators={[",", "，"]}
            options={tags.map((tag) => ({ label: tag, value: tag }))}
            onChange={setTags}
          />
        </div>

        <div className="sg-field">
          <span className="sg-label">可见性</span>
          <Segmented
            block
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={(value) => setVisibility(value as AssetVisibility)}
          />
        </div>

        <div className="sg-asset-edit-readonly">
          <div>
            <span className="sg-label">资产类型</span>
            <strong>{asset.type}</strong>
          </div>
          <div>
            <span className="sg-label">来源</span>
            <strong>{asset.sourceType}</strong>
          </div>
          <div>
            <span className="sg-label">当前版本</span>
            <strong>v{asset.lockVersion}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export function assetContentEditorHref(asset: Asset): string | null {
  if (asset.type === "document" || asset.type === "report") return `/documents/${asset.id}`;
  if (asset.type === "html") return `/html/${asset.id}`;
  if (asset.type === "presentation") return `/presentations/${asset.id}`;
  return null;
}
