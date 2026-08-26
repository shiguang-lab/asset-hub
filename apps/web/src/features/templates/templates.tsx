import { Empty, useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Tabs } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Template } from "../../entities/api.js";

const useTemplatesPageStyles = createStyles(() => ({
  grid: {
    gridTemplateColumns: "repeat(3, 1fr)",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  description: {
    margin: "6px 0 12px",
  },
}));

export function TemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { styles } = useTemplatesPageStyles();
  const [type, setType] = useState("research");
  const { data } = useQuery<Template[]>({
    queryKey: ["templates", type],
    queryFn: () => api("/templates", { params: { type } }),
  });
  const useTemplate = useMutation({
    mutationFn: (id: string) => api<Template>(`/templates/${id}/use`, { method: "POST" }),
    onSuccess: (t) => {
      toast("success", `已应用模板「${t.name}」`);
      navigate(
        type === "research"
          ? `/research/new?template=${t.id}`
          : `/presentations/new?template=${t.id}`,
      );
    },
  });
  return (
    <div>
      <h1 className="sg-h1 sg-mb">模板中心</h1>
      <Tabs
        items={[
          { key: "research", label: "调研模板" },
          { key: "presentation", label: "演示模板" },
        ]}
        activeKey={type}
        onChange={setType}
      />
      {(data?.length ?? 0) === 0 ? (
        <Empty title="暂无模板" />
      ) : (
        <div className={`sg-grid ${styles.grid}`}>
          {data?.map((t) => (
            <Card key={t.id}>
              <strong>{t.name}</strong>
              <p className={`sg-subtle ${styles.description}`}>{t.description}</p>
              <div className="sg-row-between">
                <span className="sg-subtle">已使用 {t.usageCount} 次</span>
                <Button size="small" type="primary" onClick={() => useTemplate.mutate(t.id)}>
                  使用
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
