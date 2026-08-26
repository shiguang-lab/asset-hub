import { Empty, formatRelative, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "antd";
import { createStyles } from "antd-style";
import { Link } from "react-router-dom";
import { api, type Notification } from "../../entities/api.js";

const useNotificationStyles = createStyles(({ token }) => ({
  unreadDot: {
    width: 8,
    height: 8,
    flex: "0 0 auto",
    borderRadius: "50%",
    background: token.colorPrimary,
  },
  time: { marginLeft: "auto" },
  body: { margin: "6px 0 0" },
  link: { fontSize: 13 },
}));

export function NotificationsPage() {
  const { styles } = useNotificationStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => api("/notifications", { params: { limit: 100 } }),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      toast("success", "已全部标记为已读");
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });
  return (
    <div>
      <div className="sg-row-between sg-mb">
        <h1 className="sg-h1">通知中心</h1>
        <Button size="small" onClick={() => markAll.mutate()}>
          全部已读
        </Button>
      </div>
      {(data?.length ?? 0) === 0 ? (
        <Empty title="没有通知" hint="任务完成、知识库索引、分享等事件会通知你。" />
      ) : (
        <div className="sg-col">
          {data?.map((n) => (
            <Card
              key={n.id}
              className={n.readAt ? "" : ""}
              hoverable
              onClick={() => !n.readAt && markRead.mutate(n.id)}
            >
              <div className="sg-row">
                {!n.readAt && <span className={styles.unreadDot} />}
                <strong>{n.title}</strong>
                <span className={`sg-subtle ${styles.time}`}>{formatRelative(n.createdAt)}</span>
              </div>
              {n.body && <p className={`sg-subtle ${styles.body}`}>{n.body}</p>}
              {n.link && (
                <Link to={n.link} className={styles.link} onClick={(e) => e.stopPropagation()}>
                  查看 →
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
