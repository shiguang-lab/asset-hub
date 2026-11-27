import { Avatar, Field, useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Input, Select, Switch } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useState } from "react";
import { api } from "../../entities/api.js";

const useProfileStyles = createStyles(() => ({
  summaryGrid: {
    gridTemplateColumns: "1fr 2fr",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  profileCard: { flexDirection: "column", gap: 10 },
}));

export function ProfilePage() {
  const { styles } = useProfileStyles();
  const toast = useToast();
  const { data } = useQuery<{
    profile: {
      name: string;
      defaultQuality: string;
      defaultLanguage: string;
      notifyEmail: boolean;
      createdAt: string;
    };
    workspaceId: string;
  }>({
    queryKey: ["me"],
    queryFn: () => api("/me"),
  });
  const [name, setName] = useState("");
  const [quality, setQuality] = useState("balanced");
  const [language, setLanguage] = useState("zh-CN");
  const [notifyEmail, setNotifyEmail] = useState(false);

  const profile = data?.profile;
  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setQuality(profile.defaultQuality || "balanced");
    setLanguage(profile.defaultLanguage || "zh-CN");
    setNotifyEmail(Boolean(profile.notifyEmail));
  }, [profile]);

  const save = useMutation({
    mutationFn: () =>
      api("/me", {
        method: "PATCH",
        body: {
          name: name.trim() || undefined,
          defaultQuality: quality,
          defaultLanguage: language,
          notifyEmail,
        },
      }),
    onSuccess: () => toast("success", "个人资料已保存"),
    onError: (e: Error) => toast("error", e.message),
  });

  return (
    <div>
      <h1 className="sg-h1 sg-mb">个人中心</h1>
      <div className={`sg-grid ${styles.summaryGrid}`}>
        <Card className={`sg-center ${styles.profileCard}`}>
          <Avatar name={name || profile?.name || "用户"} size={64} />
          <strong>{name || profile?.name || "未命名用户"}</strong>
          <span className="sg-subtle">工作区 {data?.workspaceId}</span>
          <span className="sg-subtle">
            加入于 {profile ? new Date(profile.createdAt).toLocaleDateString("zh-CN") : "-"}
          </span>
        </Card>
        <Card>
          <Field label="显示名称">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={profile?.name || "输入显示名称"}
            />
          </Field>
          <Field label="默认语言">
            <Select
              value={language}
              onChange={setLanguage}
              options={[
                { value: "zh-CN", label: "简体中文" },
                { value: "en", label: "English" },
              ]}
            />
          </Field>
          <Field label="默认 AI 质量模式">
            <Select
              value={quality}
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
            <Switch checked={notifyEmail} onChange={setNotifyEmail} />
          </div>
          <Button
            type="primary"
            className="sg-mt"
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            保存
          </Button>
        </Card>
      </div>
    </div>
  );
}
