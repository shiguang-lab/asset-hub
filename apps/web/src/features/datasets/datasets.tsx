import { Empty, Scrollbar, StatusBadge, useToast } from "@shiguang/ui";
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

const useDatasetStyles = createStyles(() => ({
  uploadLabel: { cursor: "pointer" },
  datasetGrid: {
    gridTemplateColumns: "repeat(3, 1fr)",
    "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
  },
  datasetMeta: { margin: "6px 0 0" },
  hiddenColumn: { maxWidth: 200, display: "none" },
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
  chart: { width: "100%", height: 420 },
  qualityTitle: { marginTop: 16 },
}));

export function DatasetsPage() {
  const { styles } = useDatasetStyles();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery<Dataset[]>({ queryKey: ["datasets"], queryFn: () => api("/datasets") });
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
    <div>
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
      {(data?.length ?? 0) === 0 ? (
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const chartRef = useRef<HTMLDivElement>(null);
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
  const [insights, setInsights] = useState<string[]>([]);

  const { data: dataset } = useQuery<Dataset>({
    queryKey: ["dataset", id],
    queryFn: () => api(`/datasets/${id}`),
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 3000 : false),
  });
  const version = dataset?.currentVersion;

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
      void queryClient.invalidateQueries({ queryKey: ["dataset", id] });
    },
  });

  const aiInsights = useMutation({
    mutationFn: () =>
      api<{ insights: string[] }>(`/datasets/${id}/ai-insights`, { method: "POST" }),
    onSuccess: (data) => setInsights(data.insights),
  });

  useEffect(() => {
    if (tab !== "charts" || !chartRef.current || !dataset?.charts?.length) return;
    const chart = echarts.init(chartRef.current);
    const spec = dataset.charts[0];
    if (spec && queryResult.data) {
      const rows = queryResult.data.rows;
      chart.setOption({
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: rows.map((r) => r[spec.x ?? "index"]).slice(0, 20),
          axisLabel: { rotate: 30 },
        },
        yAxis: { type: "value" },
        series: [
          {
            type: spec.chartType === "pie" ? "pie" : "bar",
            data: rows.map((r) => Number(r[spec.y ?? "index"] ?? 0)).slice(0, 20),
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
  }, [tab, dataset?.charts, queryResult.data]);

  if (!dataset) return <Empty title="加载中…" />;
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
        <Button onClick={() => aiInsights.mutate()}>AI 洞察</Button>
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
            <Input
              placeholder="筛选列名…"
              value={query.select.length ? "" : ""}
              readOnly
              className={styles.hiddenColumn}
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
            <Button size="small" disabled={!viewName} onClick={() => saveView.mutate()}>
              保存视图
            </Button>
          </div>
          <h3 className={`sg-h3 ${styles.quickChartTitle}`}>快速建图</h3>
          <div className="sg-row">
            <Input placeholder="图表名" id="chart-name" className={styles.chartName} />
            <Button
              size="small"
              onClick={() => {
                const name =
                  (document.getElementById("chart-name") as HTMLInputElement)?.value || "图表";
                const x = version.schema[0]?.name ?? "";
                const y =
                  version.schema.find((c) => c.type === "number" || c.type === "integer")?.name ??
                  version.schema[1]?.name ??
                  x;
                addChart.mutate({ name, chartType: "bar", x, y, aggregation: "sum" });
              }}
            >
              生成图表
            </Button>
          </div>
        </Card>
      )}

      {tab === "charts" && (
        <Card>
          {(dataset.charts?.length ?? 0) === 0 ? (
            <Empty title="还没有图表" hint="在“查询构建”中快速生成图表。" />
          ) : (
            <div ref={chartRef} className={styles.chart} />
          )}
        </Card>
      )}

      {tab === "views" && (
        <Card>
          {(dataset.views?.length ?? 0) === 0 ? (
            <Empty title="还没有保存的视图" />
          ) : (
            dataset.views?.map((v) => (
              <div key={v.id} className="sg-row-between">
                <strong>{v.name}</strong>
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
                    }));
                    setTab("table");
                  }}
                >
                  应用
                </Button>
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

function coerceValue(value: string): unknown {
  if (value === "") return "";
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}
