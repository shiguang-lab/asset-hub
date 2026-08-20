import { Avatar, Field, useToast } from "@shiguang/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Card, Input, Select, Switch } from "antd";
import { useState } from "react";
import { api } from "../../entities/api.js";

export function ProfilePage() {
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
    credits: number;
  }>({
    queryKey: ["me"],
    queryFn: () => api("/me"),
  });
  const [name, setName] = useState("");
  const [quality, setQuality] = useState("balanced");
  const [language, setLanguage] = useState("zh-CN");
  const [notifyEmail, setNotifyEmail] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api("/me", {
        method: "PATCH",
        body: {
          name: name || undefined,
          defaultQuality: quality,
          defaultLanguage: language,
          notifyEmail,
        },
      }),
    onSuccess: () => toast("success", "个人资料已保存"),
    onError: (e: Error) => toast("error", e.message),
  });

  const profile = data?.profile;
  return (
    <div>
      <h1 className="sg-h1 sg-mb">个人中心</h1>
      <div className="sg-grid" style={{ gridTemplateColumns: "1fr 2fr" }}>
        <Card className="sg-center" style={{ flexDirection: "column", gap: 10 }}>
          <Avatar name={name || profile?.name || "用户"} size={64} />
          <strong>{name || profile?.name || "未命名用户"}</strong>
          <span className="sg-subtle">工作区 {data?.workspaceId}</span>
          <span className="sg-badge sg-badge-accent">{data?.credits ?? 0} Credits</span>
          <span className="sg-subtle">
            加入于 {profile ? new Date(profile.createdAt).toLocaleDateString("zh-CN") : "-"}
          </span>
        </Card>
        <Card>
          <Field label="显示名称">
            <Input
              value={(name || profile?.name) ?? ""}
              onChange={(e) => setName(e.target.value)}
              placeholder={profile?.name}
            />
          </Field>
          <Field label="默认语言">
            <Select
              value={(language || profile?.defaultLanguage) ?? "zh-CN"}
              onChange={setLanguage}
              options={[
                { value: "zh-CN", label: "简体中文" },
                { value: "en", label: "English" },
              ]}
            />
          </Field>
          <Field label="默认 AI 质量模式">
            <Select
              value={(quality || profile?.defaultQuality) ?? "balanced"}
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
            <Switch
              checked={(notifyEmail || profile?.notifyEmail) ?? false}
              onChange={setNotifyEmail}
            />
          </div>
          <Button type="primary" className="sg-mt" onClick={() => save.mutate()}>
            保存
          </Button>
        </Card>
      </div>
    </div>
  );
}
