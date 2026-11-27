import { Empty, Loading, Scrollbar, StatusBadge, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Select, Tabs } from "antd";
import { createStyles } from "antd-style";
import * as echarts from "echarts";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type ChartSpec,
  type Dataset,
  type SavedView,
  uploadFile,
} from "../../entities/api.js";
import { AppPagination } from "../../shared/AppPagination.js";
import { AppTable } from "../../shared/AppTable.js";
import { useDeleteConfirm } from "../../shared/useDeleteConfirm";

const useDatasetStyles = createStyles(() => ({
  uploadLabel: { cursor: "pointer" },
  datasetGrid: {
    gridTemplateColumns: "repeat(3, 1fr)",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  datasetMeta: { margin: "6px 0 0" },
  columnSelect: { minWidth: 220, maxWidth: 360 },
  sortColumn: { width: 180 },
  sortDirection: { width: 100 },
  rowLimit: { width: 110 },
  filterColumn: { width: 180 },
  filterOperator: { width: 120 },
  filterValue: { maxWidth: 160 },
  viewName: { maxWidth: 200 },
  tableScroll: {
    maxWidth: "100%",
    maxHeight: 560,
    minWidth: 0,
  },
  tableContent: {
    minWidth: "max-content",
  },
  quickChartTitle: { marginTop: 20 },
  chartName: { maxWidth: 160 },
  chartField: { minWidth: 120 },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 16,
  },
  chart: { width: "100%", height: 340 },
  qualityTitle: { marginTop: 16 },
}));

export function DatasetsPage() {
  const { styles } = useDatasetStyles();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<Dataset[]>({
    queryKey: ["datasets"],
    queryFn: () => api("/datasets"),
  });
  const importMutation = useMutation({
    mutationFn: (file: File) =>
      uploadFile<{ dataset: Dataset; task: unknown }>("/datasets/import", file),
    onSuccess: (data) => {
      toast("success", "数据已上传，正在后台解析导入");
      void queryClient.invalidateQueries({ queryKey: ["datasets"] });
      navigate(`/datasets/${data.dataset.id}`);
    },
    onError: (e: Error) => toast("error", e.message),
  });
  return (
    <div className="sg-page-fill">
      <div className="sg-row-between sg-mb">
        <h1 className="sg-h1">数据集</h1>
        <label className={`sg-btn sg-btn-primary ${styles.uploadLabel}`}>
          上传 CSV / JSON
          <input
            type="file"
            accept=".csv,.json,.tsv"
            hidden
            onChange={(e) => e.target.files?.[0] && importMutation.mutate(e.target.files[0])}
          />
        </label>
      </div>
      {isLoading ? (
        <Loading loading />
      ) : (data?.length ?? 0) === 0 ? (
        <Empty title="还没有数据集" hint="上传 CSV/JSON 后，可筛选、统计并生成 AI 洞察。" />
      ) : (
        <div className={`sg-grid ${styles.datasetGrid}`}>
          {data?.map((d) => (
            <Card key={d.id} onClick={() => navigate(`/datasets/${d.id}`)} hoverable>
              <div className="sg-row-between">
                <strong>{d.name}</strong>
                <StatusBadge status={d.status} />
              </div>
              <p className={`sg-subtle ${styles.datasetMeta}`}>
                {d.rowCount.toLocaleString()} 行 · {d.currentVersion?.columnCount ?? 0} 列
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface QueryRow {
  columns: Array<{ id: string; name: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  total: number;
  elapsedMs: number;
}

export function DatasetDetailPage() {
  const { styles } = useDatasetStyles();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirmDelete } = useDeleteConfirm();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("table");
  const [query, setQuery] = useState<{
    select: string[];
    filters: Array<{ column: string; op: string; value: string }>;
    sort: Array<{ column: string; direction: string }>;
    limit: number;
    offset: number;
  }>({
    select: [],
    filters: [],
    sort: [],
    limit: 100,
    offset: 0,
  });
  const [filterCol, setFilterCol] = useState("");
  const [filterOp, setFilterOp] = useState("contains");
  const [filterVal, setFilterVal] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [viewName, setViewName] = useState("");
  const [chartName, setChartName] = useState("");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [chartX, setChartX] = useState("");
  const [chartY, setChartY] = useState("");
  const [chartAgg, setChartAgg] = useState<"sum" | "avg" | "count" | "min" | "max">("sum");
  const [insights, setInsights] = useState<string[]>([]);

  const { data: dataset } = useQuery<Dataset>({
    queryKey: ["dataset", id],
    queryFn: () => api(`/datasets/${id}`),
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 3000 : false),
  });
  const version = dataset?.currentVersion;

  useEffect(() => {
    if (!version?.schema.length) return;
    if (!chartX) {
      setChartX(version.schema[0]?.name ?? "");
    }
    if (!chartY) {
      const numericCol = version.schema.find((c) => c.type === "number" || c.type === "integer");
      setChartY(numericCol?.name ?? version.schema[1]?.name ?? version.schema[0]?.name ?? "");
    }
  }, [version, chartX, chartY]);

  const queryResult = useQuery<QueryRow>({
    queryKey: ["dataset-query", id, query],
    queryFn: () =>
      api(`/datasets/${id}/query`, {
        method: "POST",
        body: {
          datasetVersionId: version?.id,
          select: query.select,
          filters: query.filters
            .filter((f) => f.column)
            .map((f) => ({
              column: f.column,
              op: f.op,
              value: f.op === "is_null" ? undefined : coerceValue(f.value),
            })),
          sort: query.sort.filter((s) => s.column),
          limit: query.limit,
          offset: query.offset,
        },
      }),
    enabled: Boolean(version?.id),
  });

  const saveView = useMutation({
    mutationFn: () =>
      api<SavedView>(`/datasets/${id}/views`, {
        method: "POST",
        body: { name: viewName, query: { datasetVersionId: version?.id, ...query } },
      }),
    onSuccess: () => {
      toast("success", "视图已保存");
      setViewName("");
      void queryClient.invalidateQueries({ queryKey: ["dataset", id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const deleteView = useMutation({
    mutationFn: (viewId: string) => api(`/datasets/${id}/views/${viewId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("success", "视图已删除");
      void queryClient.invalidateQueries({ queryKey: ["dataset", id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const addChart = useMutation({
    mutationFn: (chart: {
      name: string;
      chartType: string;
      x: string;
      y: string;
      aggregation: string;
    }) => api<ChartSpec>(`/datasets/${id}/charts`, { method: "POST", body: chart }),
    onSuccess: () => {
      toast("success", "图表已创建");
      setChartName("");
      setTab("charts");
      void queryClient.invalidateQueries({ queryKey: ["dataset", id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const deleteChart = useMutation({
    mutationFn: (chartId: string) => api(`/datasets/${id}/charts/${chartId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("success", "图表已删除");
      void queryClient.invalidateQueries({ queryKey: ["dataset", id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const deleteDataset = useMutation({
    mutationFn: () => api(`/datasets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("success", "数据集已删除");
      void queryClient.invalidateQueries({ queryKey: ["datasets"] });
      navigate("/datasets");
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const aiInsights = useMutation({
    mutationFn: () =>
      api<{ insights: string[] }>(`/datasets/${id}/ai-insights`, { method: "POST" }),
    onSuccess: (data) => setInsights(data.insights),
    onError: (e: Error) => toast("error", e.message),
  });

  if (!dataset) return <Loading loading />;
  if (!version) {
    return (
      <div>
        <h1 className="sg-h1">{dataset.name}</h1>
        <Empty title="数据集正在解析" hint="上传后由后台解析，完成后可查询。请稍候或刷新。" />
      </div>
    );
  }

  const applyFilter = () => {
    if (!filterCol) return;
    setQuery((q) => ({
      ...q,
      filters: [...q.filters, { column: filterCol, op: filterOp, value: filterVal }],
    }));
    setFilterVal("");
  };

  return (
    <div>
      <div className="sg-row-between sg-mb">
        <div>
          <h1 className="sg-h1">{dataset.name}</h1>
          <p className="sg-subtle">
            {version.fileName} · v{version.version} · {version.rowCount.toLocaleString()} 行 ·{" "}
            {version.columnCount} 列 · 查询耗时 {queryResult.data?.elapsedMs ?? "-"}ms
          </p>
        </div>
        <div className="sg-row">
          <Button loading={aiInsights.isPending} onClick={() => aiInsights.mutate()}>
            AI 洞察
          </Button>
          <Button
            danger
            loading={deleteDataset.isPending}
            onClick={() =>
              confirmDelete({
                title: `删除数据集「${dataset.name}」？`,
                content: "删除后数据表、视图与图表配置将一并移除。",
                onConfirm: () => deleteDataset.mutate(),
              })
            }
          >
            删除
          </Button>
        </div>
      </div>

      {insights.length > 0 && (
        <Card className="sg-mb">
          <h3 className="sg-h3">AI 洞察</h3>
          <ul>
            {insights.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Card>
      )}

      <Tabs
        items={[
          { key: "table", label: "数据表" },
          { key: "query", label: "查询构建" },
          { key: "charts", label: "图表" },
          { key: "views", label: "保存视图" },
          { key: "quality", label: "质量" },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

      {tab === "table" && (
        <Card>
          <div className="sg-dataset-toolbar">
            <Select
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              placeholder="选择显示列（默认全部）"
              value={query.select}
              onChange={(cols) => setQuery((q) => ({ ...q, select: cols, offset: 0 }))}
              options={version.schema.map((c) => ({ value: c.name, label: c.name }))}
              className={styles.columnSelect}
            />
            <Select
              value={sortCol}
              onChange={(v) => {
                setSortCol(v);
                setQuery((q) => ({ ...q, sort: v ? [{ column: v, direction: sortDir }] : [] }));
              }}
              options={[
                { value: "", label: "排序列…" },
                ...version.schema.map((c) => ({ value: c.name, label: c.name })),
              ]}
              className={styles.sortColumn}
            />
            <Select
              value={sortDir}
              onChange={(v) => {
                setSortDir(v);
                setQuery((q) => ({
                  ...q,
                  sort: sortCol ? [{ column: sortCol, direction: v }] : [],
                }));
              }}
              options={[
                { value: "asc", label: "升序" },
                { value: "desc", label: "降序" },
              ]}
              className={styles.sortDirection}
            />
            <Select
              value={String(query.limit)}
              onChange={(v) => setQuery((q) => ({ ...q, limit: Number(v) }))}
              options={[
                { value: "100", label: "100 行" },
                { value: "500", label: "500 行" },
                { value: "1000", label: "1000 行" },
              ]}
              className={styles.rowLimit}
            />
          </div>
          <Scrollbar className={styles.tableScroll}>
            <div className={styles.tableContent}>
              <AppTable<Record<string, unknown>>
                rowKey={(_, i) => String(i)}
                dataSource={queryResult.data?.rows ?? []}
                pagination={false}
                size="middle"
                columns={(queryResult.data?.columns ?? []).map((c) => ({
                  title: c.name,
                  dataIndex: c.name,
                  key: c.id,
                  render: (v: unknown) => String(v ?? ""),
                  ellipsis: true,
                }))}
              />
            </div>
          </Scrollbar>
          <AppPagination
            total={queryResult.data?.total ?? 0}
            current={Math.floor(query.offset / query.limit) + 1}
            pageSize={query.limit}
            onChange={(nextPage) => setQuery((q) => ({ ...q, offset: (nextPage - 1) * q.limit }))}
            itemLabel="行"
          />
        </Card>
      )}

      {tab === "query" && (
        <Card>
          <h3 className="sg-h3">筛选条件</h3>
          <div className="sg-row sg-mb">
            <Select
              value={filterCol}
              onChange={setFilterCol}
              options={[
                { value: "", label: "列…" },
                ...version.schema.map((c) => ({ value: c.name, label: c.name })),
              ]}
              className={styles.filterColumn}
            />
            <Select
              value={filterOp}
              onChange={setFilterOp}
              options={[
                { value: "eq", label: "等于" },
                { value: "neq", label: "不等于" },
                { value: "gt", label: "大于" },
                { value: "gte", label: "大于等于" },
                { value: "lt", label: "小于" },
                { value: "lte", label: "小于等于" },
                { value: "contains", label: "包含" },
                { value: "is_null", label: "为空" },
              ]}
              className={styles.filterOperator}
            />
            {filterOp !== "is_null" && (
              <Input
                value={filterVal}
                onChange={(e) => setFilterVal(e.target.value)}
                placeholder="值"
                className={styles.filterValue}
              />
            )}
            <Button size="small" onClick={applyFilter}>
              + 添加
            </Button>
          </div>
          {query.filters.map((f, i) => (
            <div key={i} className="sg-row sg-mb-sm">
              <span className="sg-badge">
                {f.column} {f.op} {f.value}
              </span>
              <Button
                size="small"
                type="primary"
                danger
                onClick={() =>
                  setQuery((q) => ({ ...q, filters: q.filters.filter((_, j) => j !== i) }))
                }
              >
                移除
              </Button>
            </div>
          ))}
          <div className="sg-row sg-mt">
            <Input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="视图名称"
              className={styles.viewName}
            />
            <Button
              size="small"
              loading={saveView.isPending}
              disabled={!viewName.trim()}
              onClick={() => saveView.mutate()}
            >
              保存视图
            </Button>
          </div>
          <h3 className={`sg-h3 ${styles.quickChartTitle}`}>快速建图</h3>
          <div className="sg-row sg-wrap">
            <Input
              placeholder="图表名"
              value={chartName}
              onChange={(e) => setChartName(e.target.value)}
              className={styles.chartName}
            />
            <Select
              value={chartType}
              onChange={(v) => setChartType(v as "bar" | "line" | "pie")}
              options={[
                { value: "bar", label: "柱状图" },
                { value: "line", label: "折线图" },
                { value: "pie", label: "饼图" },
              ]}
              className={styles.chartField}
            />
            <Select
              value={chartX || undefined}
              placeholder="维度列 (X)"
              onChange={setChartX}
              options={version.schema.map((c) => ({ value: c.name, label: c.name }))}
              className={styles.chartField}
            />
            <Select
              value={chartY || undefined}
              placeholder="指标列 (Y)"
              onChange={setChartY}
              options={version.schema.map((c) => ({ value: c.name, label: c.name }))}
              className={styles.chartField}
            />
            <Select
              value={chartAgg}
              onChange={(v) => setChartAgg(v as "sum" | "avg" | "count" | "min" | "max")}
              options={[
                { value: "sum", label: "求和" },
                { value: "avg", label: "平均" },
                { value: "count", label: "计数" },
                { value: "min", label: "最小" },
                { value: "max", label: "最大" },
              ]}
              className={styles.chartField}
            />
            <Button
              size="small"
              type="primary"
              loading={addChart.isPending}
              disabled={!chartX || !chartY}
              onClick={() =>
                addChart.mutate({
                  name: chartName.trim() || `${chartY} / ${chartX}`,
                  chartType,
                  x: chartX,
                  y: chartY,
                  aggregation: chartAgg,
                })
              }
            >
              生成图表
            </Button>
          </div>
        </Card>
      )}

      {tab === "charts" && (
        <div>
          {(dataset.charts?.length ?? 0) === 0 ? (
            <Card>
              <Empty title="还没有图表" hint="在“查询构建”中快速生成图表。" />
            </Card>
          ) : (
            <div className={styles.chartGrid}>
              {dataset.charts?.map((spec) => (
                <DatasetChartCard
                  key={spec.id}
                  spec={spec}
                  rows={queryResult.data?.rows ?? []}
                  chartClassName={styles.chart}
                  deleting={deleteChart.isPending}
                  onDelete={() =>
                    confirmDelete({
                      title: `删除图表「${spec.name}」？`,
                      onConfirm: () => deleteChart.mutate(spec.id),
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "views" && (
        <Card>
          {(dataset.views?.length ?? 0) === 0 ? (
            <Empty title="还没有保存的视图" />
          ) : (
            dataset.views?.map((v) => (
              <div key={v.id} className="sg-row-between sg-mb-sm">
                <strong>{v.name}</strong>
                <div className="sg-row">
                  <Button
                    size="small"
                    onClick={() => {
                      const saved = v.query as {
                        filters?: unknown;
                        sort?: unknown;
                        select?: string[];
                      };
                      setQuery((q) => ({
                        ...q,
                        filters: (saved.filters ?? []) as never,
                        sort: (saved.sort ?? []) as never,
                        select: saved.select ?? [],
                        offset: 0,
                      }));
                      setTab("table");
                    }}
                  >
                    应用
                  </Button>
                  <Button
                    size="small"
                    danger
                    loading={deleteView.isPending}
                    onClick={() =>
                      confirmDelete({
                        title: `删除视图「${v.name}」？`,
                        onConfirm: () => deleteView.mutate(v.id),
                      })
                    }
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {tab === "quality" && (
        <Card>
          <h3 className="sg-h3">质量报告</h3>
          {(version.qualityIssues?.length ?? 0) === 0 ? (
            <Empty title="没有质量问题" />
          ) : (
            version.qualityIssues.map((q, i) => (
              <div key={i} className="sg-row sg-mb-sm">
                <span className="sg-badge sg-badge-warning">{String(q.severity)}</span>
                <span>{String(q.message)}</span>
              </div>
            ))
          )}
          <h3 className={`sg-h3 ${styles.qualityTitle}`}>列画像</h3>
          <AppTable<{ columnId: string; name: string; type: string; distinctCount?: number }>
            rowKey="columnId"
            dataSource={version.schema}
            pagination={false}
            size="middle"
            columns={[
              { title: "列", dataIndex: "name" },
              { title: "类型", dataIndex: "type" },
              {
                title: "非空",
                key: "nonNull",
                render: (_v, c) => {
                  const p = (
                    version.profile?.columns as
                      | Record<
                          string,
                          {
                            nonNull: number;
                            distinct: number;
                            min: number | null;
                            max: number | null;
                            avg: number | null;
                          }
                        >
                      | undefined
                  )?.[c.name];
                  return p?.nonNull ?? "-";
                },
              },
              {
                title: "去重",
                key: "distinct",
                render: (_v, c) => {
                  const p = (
                    version.profile?.columns as
                      | Record<
                          string,
                          {
                            nonNull: number;
                            distinct: number;
                            min: number | null;
                            max: number | null;
                            avg: number | null;
                          }
                        >
                      | undefined
                  )?.[c.name];
                  return p?.distinct ?? c.distinctCount ?? "-";
                },
              },
              {
                title: "最小值",
                key: "min",
                render: (_v, c) => {
                  const p = (
                    version.profile?.columns as
                      | Record<
                          string,
                          {
                            nonNull: number;
                            distinct: number;
                            min: number | null;
                            max: number | null;
                            avg: number | null;
                          }
                        >
                      | undefined
                  )?.[c.name];
                  return p?.min ?? "-";
                },
              },
              {
                title: "最大值",
                key: "max",
                render: (_v, c) => {
                  const p = (
                    version.profile?.columns as
                      | Record<
                          string,
                          {
                            nonNull: number;
                            distinct: number;
                            min: number | null;
                            max: number | null;
                            avg: number | null;
                          }
                        >
                      | undefined
                  )?.[c.name];
                  return p?.max ?? "-";
                },
              },
              {
                title: "均值",
                key: "avg",
                render: (_v, c) => {
                  const p = (
                    version.profile?.columns as
                      | Record<
                          string,
                          {
                            nonNull: number;
                            distinct: number;
                            min: number | null;
                            max: number | null;
                            avg: number | null;
                          }
                        >
                      | undefined
                  )?.[c.name];
                  return p?.avg != null ? Number(p.avg).toFixed(2) : "-";
                },
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

function aggregateChartPoints(
  rows: Array<Record<string, unknown>>,
  spec: ChartSpec,
): Array<{ name: string; value: number }> {
  const xKey = spec.x ?? "";
  const yKey = spec.y ?? "";
  if (!xKey) return [];
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const label = String(row[xKey] ?? "(空)");
    const raw = row[yKey];
    const numVal = typeof raw === "number" ? raw : Number(raw ?? 0);
    const list = buckets.get(label) ?? [];
    list.push(Number.isFinite(numVal) ? numVal : 0);
    buckets.set(label, list);
  }
  const agg = spec.aggregation || "sum";
  return [...buckets.entries()].slice(0, 24).map(([name, vals]) => {
    let value = 0;
    if (agg === "count") value = vals.length;
    else if (agg === "avg") value = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    else if (agg === "min") value = Math.min(...vals);
    else if (agg === "max") value = Math.max(...vals);
    else value = vals.reduce((a, b) => a + b, 0);
    return { name, value: Number(value.toFixed(2)) };
  });
}

function DatasetChartCard({
  spec,
  rows,
  chartClassName,
  deleting,
  onDelete,
}: {
  spec: ChartSpec;
  rows: Array<Record<string, unknown>>;
  chartClassName: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const points = aggregateChartPoints(rows, spec);
    if (spec.chartType === "pie") {
      chart.setOption({
        tooltip: { trigger: "item" },
        series: [
          {
            name: spec.name,
            type: "pie",
            radius: ["35%", "70%"],
            data: points,
          },
        ],
      });
    } else {
      chart.setOption({
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: points.map((p) => p.name),
          axisLabel: { rotate: 25 },
        },
        yAxis: { type: "value" },
        series: [
          {
            name: spec.y ?? spec.name,
            type: spec.chartType === "line" ? "line" : "bar",
            smooth: spec.chartType === "line",
            data: points.map((p) => p.value),
          },
        ],
      });
    }
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [rows, spec]);

  return (
    <Card>
      <div className="sg-row-between sg-mb-sm">
        <div>
          <strong>{spec.name}</strong>
          <div className="sg-subtle">
            {spec.chartType} · {spec.x ?? "-"} × {spec.y ?? "-"} ({spec.aggregation})
          </div>
        </div>
        <Button size="small" danger loading={deleting} onClick={onDelete}>
          删除
        </Button>
      </div>
      <div ref={ref} className={chartClassName} />
    </Card>
  );
}

function coerceValue(value: string): unknown {
  if (value === "") return "";
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}
