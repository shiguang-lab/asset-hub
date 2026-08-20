import { Empty, formatDate, Table } from "@shiguang/ui";
import { useQuery } from "@tanstack/react-query";
import { Card } from "antd";
import { api, type CreditAccount } from "../../entities/api.js";

export function BillingPage() {
  const { data } = useQuery<{
    account: CreditAccount;
    ledger: Array<{
      entryType: string;
      amount: number;
      description: string;
      createdAt: string;
      taskId: string | null;
    }>;
  }>({
    queryKey: ["credits"],
    queryFn: () => api("/credits"),
  });
  const { data: plans } = useQuery<{
    plans: Array<{ id: string; name: string; credits: number; price: number; features: string[] }>;
  }>({
    queryKey: ["plans"],
    queryFn: () => api("/credits/plan"),
  });
  return (
    <div>
      <h1 className="sg-h1 sg-mb">Credits 与套餐</h1>
      <div className="sg-grid" style={{ gridTemplateColumns: "1fr 2fr" }}>
        <Card>
          <p className="sg-eyebrow">当前余额</p>
          <div style={{ fontSize: 42, fontWeight: 800, color: "var(--sg-accent)" }}>
            {data?.account?.balance.toLocaleString() ?? "…"}
          </div>
          <p className="sg-subtle">
            累计获得 {data?.account?.totalGranted.toLocaleString()} · 已用{" "}
            {data?.account?.totalUsed.toLocaleString()}
          </p>
          <p className="sg-hint">
            Credits 用于 Research / Agent / AI 功能；文档编辑与基础发布不消耗。
          </p>
        </Card>
        <Card>
          <h3 className="sg-h3">套餐</h3>
          <div className="sg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 10 }}>
            {plans?.plans.map((p) => (
              <div
                key={p.id}
                className="sg-card"
                style={{ border: p.id === "pro" ? "1px solid var(--sg-accent)" : undefined }}
              >
                <strong>{p.name}</strong>
                <div style={{ fontSize: 24, fontWeight: 700, margin: "6px 0" }}>
                  ¥{p.price}
                  <span style={{ fontSize: 12, color: "var(--sg-muted)" }}>/月</span>
                </div>
                <p className="sg-subtle">{p.credits.toLocaleString()} Credits</p>
                <ul style={{ paddingLeft: 18, margin: "8px 0" }}>
                  {p.features.map((f) => (
                    <li key={f} style={{ fontSize: 12.5 }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <h2 className="sg-h2 sg-mt">用量明细</h2>
      <Card>
        {(data?.ledger?.length ?? 0) === 0 ? (
          <Empty title="暂无明细" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>说明</th>
                <th>金额</th>
              </tr>
            </thead>
            <tbody>
              {data?.ledger.map((l) => (
                <tr key={l.createdAt + l.entryType + String(l.amount)}>
                  <td>{formatDate(l.createdAt)}</td>
                  <td>{l.entryType}</td>
                  <td>{l.description}</td>
                  <td style={{ fontWeight: 700 }}>
                    {l.amount > 0 ? "+" : ""}
                    {l.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
