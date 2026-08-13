import type { DatasetQuery, DatasetQueryResult, DatasetVersion } from "@shiguang/contracts";

export interface ParsedDataset {
  fileName: string;
  format: "csv" | "json" | "tsv" | "xlsx";
  rows: Array<Record<string, unknown>>;
  warnings: string[];
}

const MAX_ROWS = 1_000_000;
const MAX_CELLS = 5_000_000;

export function parseDataset(buffer: Buffer, fileName: string): ParsedDataset {
  const lower = fileName.toLowerCase();
  const format: ParsedDataset["format"] = lower.endsWith(".json")
    ? "json"
    : lower.endsWith(".tsv")
      ? "tsv"
      : lower.endsWith(".xlsx")
        ? "xlsx"
        : "csv";
  if (format === "xlsx") {
    throw new Error("XLSX 解析需由 compute-worker 处理，请确保 compute-worker 已启动");
  }
  const text = buffer.toString("utf8");
  if (format === "json") {
    const parsed = JSON.parse(text) as unknown;
    const rows = Array.isArray(parsed) ? parsed : ((parsed as { rows?: unknown[] }).rows ?? []);
    return {
      fileName,
      format,
      rows: rows.slice(0, MAX_ROWS) as Array<Record<string, unknown>>,
      warnings: [],
    };
  }
  const delimiter = format === "tsv" ? "\t" : detectDelimiter(text);
  const { rows, warnings } = parseDelimited(text, delimiter);
  return { fileName, format, rows, warnings };
}

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return (counts[0]?.n ?? 1) > 1 ? (counts[0]?.d ?? ",") : ",";
}

function parseDelimited(
  text: string,
  delimiter: string,
): {
  rows: Array<Record<string, unknown>>;
  headers: string[];
  warnings: string[];
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], headers: [], warnings: ["空文件"] };
  const headers = splitLine(lines[0] ?? "", delimiter).map((h, i) => h.trim() || `column_${i + 1}`);
  const rows: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  let cells = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const values = splitLine(lines[i] ?? "", delimiter);
    if (values.length === 0) continue;
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c += 1) {
      const raw = values[c] ?? "";
      row[headers[c] ?? `column_${c + 1}`] = coerce(raw);
      cells += 1;
      if (cells > MAX_CELLS) {
        warnings.push("行数过多，已截断");
        return { rows, headers, warnings };
      }
    }
    if (values.length !== headers.length && i < 50) {
      warnings.push(`第 ${i + 1} 行列数与表头不一致`);
    }
    rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }
  return { rows, headers, warnings };
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function coerce(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
  return trimmed;
}

export function inferSchema(rows: Array<Record<string, unknown>>): DatasetVersion["schema"] {
  const columnNames = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return columnNames.map((name) => {
    const values = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined);
    const types = new Set(values.map((v) => typeOf(v)));
    const type =
      types.has("number") && !types.has("string")
        ? values.every((v) => Number.isInteger(v))
          ? "integer"
          : "number"
        : types.has("string")
          ? "string"
          : types.has("boolean")
            ? "boolean"
            : "null";
    return {
      columnId: `col_${
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "") || "c"
      }`,
      name,
      type,
      nullable: values.length < rows.length,
      distinctCount: new Set(values.map((v) => String(v))).size,
    };
  });
}

function typeOf(v: unknown): "string" | "number" | "boolean" | "date" | "null" {
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "date";
    return "string";
  }
  return "null";
}

export function profileDataset(
  rows: Array<Record<string, unknown>>,
  schema: DatasetVersion["schema"],
): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  for (const col of schema) {
    const values = rows.map((r) => r[col.name]).filter((v) => v !== null && v !== undefined);
    const numeric = values.filter((v) => typeof v === "number") as number[];
    const strings = values.filter((v) => typeof v === "string") as string[];
    columns[col.name] = {
      nonNull: values.length,
      nullCount: rows.length - values.length,
      distinct: col.distinctCount,
      min: numeric.length > 0 ? Math.min(...numeric.slice(0, 10_000)) : null,
      max: numeric.length > 0 ? Math.max(...numeric.slice(0, 10_000)) : null,
      avg:
        numeric.length > 0
          ? numeric.slice(0, 10_000).reduce((a, b) => a + b, 0) / Math.min(numeric.length, 10_000)
          : null,
      sample: strings.slice(0, 3),
    };
  }
  return { rowCount: rows.length, columns, generatedAt: new Date().toISOString() };
}

export function qualityIssues(
  rows: Array<Record<string, unknown>>,
  schema: DatasetVersion["schema"],
): DatasetVersion["qualityIssues"] {
  const issues: DatasetVersion["qualityIssues"] = [];
  for (const col of schema) {
    let bad = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const v = rows[i]?.[col.name];
      if (col.type === "number" && typeof v === "string" && v.trim() !== "") bad += 1;
      if (col.type === "integer" && typeof v === "number" && !Number.isInteger(v)) bad += 1;
    }
    if (bad > 0) {
      issues.push({
        severity: "warning",
        row: null,
        column: col.name,
        message: `${col.name} 列有 ${bad} 个无法严格转换的值`,
      });
    }
    if (col.nullable && col.nullable) {
      const nulls = rows.filter((r) => r[col.name] === null).length;
      if (nulls > rows.length * 0.9 && rows.length > 0) {
        issues.push({
          severity: "info",
          row: null,
          column: col.name,
          message: `${col.name} 列大部分为空`,
        });
      }
    }
  }
  return issues;
}

export function executeDatasetQuery(
  rows: Array<Record<string, unknown>>,
  schema: DatasetVersion["schema"],
  query: DatasetQuery,
): DatasetQueryResult {
  const started = Date.now();
  const nameToId = new Map(schema.map((c) => [c.name, c.columnId]));
  const idToName = new Map(schema.map((c) => [c.columnId, c.name]));
  const validateColumn = (column: string): string => {
    const id = nameToId.get(column) ?? (idToName.has(column) ? column : null);
    if (!id) throw new Error(`未知列: ${column}`);
    return id;
  };

  let filtered = rows;
  for (const filter of query.filters) {
    validateColumn(filter.column);
    filtered = filtered.filter((row) => {
      const value = row[filter.column];
      switch (filter.op) {
        case "eq":
          return value === filter.value;
        case "neq":
          return value !== filter.value;
        case "gt":
          return (value as number) > Number(filter.value);
        case "gte":
          return (value as number) >= Number(filter.value);
        case "lt":
          return (value as number) < Number(filter.value);
        case "lte":
          return (value as number) <= Number(filter.value);
        case "contains":
          return String(value ?? "").includes(String(filter.value));
        case "in":
          return Array.isArray(filter.value) && filter.value.includes(value);
        case "is_null":
          return value === null || value === undefined;
        default:
          return true;
      }
    });
  }

  const total = filtered.length;
  if (query.sort.length > 0) {
    for (const sort of query.sort) {
      validateColumn(sort.column);
    }
    filtered = [...filtered].sort((a, b) => {
      for (const sort of query.sort) {
        const av = a[sort.column];
        const bv = b[sort.column];
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""), "zh-CN");
        if (cmp !== 0) return sort.direction === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }

  const outputColumns = query.select.map((c) => {
    validateColumn(c);
    return {
      id: nameToId.get(c) ?? c,
      name: c,
      type: schema.find((s) => s.name === c)?.type ?? "string",
    };
  });

  let resultRows: Array<Record<string, unknown>>;
  if (query.groupBy.length > 0 || query.aggregations.length > 0) {
    const groupCols = query.groupBy.map((c) => {
      validateColumn(c);
      return c;
    });
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const row of filtered) {
      const key = groupCols.map((c) => String(row[c] ?? "")).join("\u0001");
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
    resultRows = Array.from(groups.entries()).map(([key, groupRows]) => {
      const out: Record<string, unknown> = {};
      groupCols.forEach((c, i) => {
        out[c] = key.split("\u0001")[i] ?? "";
      });
      for (const agg of query.aggregations) {
        validateColumn(agg.column);
        const values = groupRows
          .map((r) => r[agg.column])
          .filter((v) => typeof v === "number") as number[];
        out[agg.as] = aggregate(values, agg.op);
      }
      return out;
    });
    for (const agg of query.aggregations) {
      outputColumns.push({ id: agg.as, name: agg.as, type: "number" });
    }
  } else {
    const selected = query.select.length > 0 ? query.select : schema.map((c) => c.name);
    resultRows = filtered.slice(query.offset, query.offset + query.limit).map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of selected) out[col] = row[col] ?? null;
      return out;
    });
  }

  if (outputColumns.length === 0) {
    for (const col of schema) {
      outputColumns.push({ id: col.columnId, name: col.name, type: col.type });
    }
  }

  const limited = filtered.length > query.offset + query.limit || resultRows.length > query.limit;
  return {
    columns: outputColumns,
    rows: resultRows.slice(0, query.limit),
    total,
    limited,
    elapsedMs: Date.now() - started,
    warnings: [],
  };
}

function aggregate(values: number[], op: string): number | null {
  if (values.length === 0) return null;
  switch (op) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "count":
      return values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return null;
  }
}
