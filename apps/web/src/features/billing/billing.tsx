import { useQuery } from "@tanstack/react-query";
import { Card } from "antd";
import { createStyles } from "antd-style";
import { api } from "../../entities/api.js";

const useBillingStyles = createStyles(({ token }) => ({
  root: { minWidth: 0 },
  balance: {
    fontSize: 42,
    fontWeight: 800,
    color: (token as typeof token & Record<string, string>).colorAccent ?? "#7c3cff",
  },
}));

/**
 * Points are owned by the external account system. Asset Hub only displays
 * the balance returned by its read-only integration endpoint.
 */
export function BillingPage() {
  const { styles } = useBillingStyles();
  const { data, isLoading } = useQuery<{ balance: number }>({
    queryKey: ["credits"],
    queryFn: () => api("/credits"),
  });

  return (
    <div className={styles.root}>
      <h1 className="sg-h1 sg-mb">积分余额</h1>
      <Card>
        <p className="sg-eyebrow">当前余额</p>
        <div className={styles.balance}>
          {isLoading ? "…" : (data?.balance ?? 0).toLocaleString("zh-CN")}
        </div>
      </Card>
    </div>
  );
}
