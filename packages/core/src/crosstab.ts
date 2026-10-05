import type { CrosstabDimension, CrosstabMeasure, TableColumn, TableHeaderCell } from "@reporting/schema";

type Aggregate = NonNullable<CrosstabMeasure["aggregate"]>;
type Key = unknown[];

export interface CrosstabDefinition {
  id?: string;
  dataset: string;
  rows: readonly CrosstabDimension[] | readonly Partial<CrosstabDimension>[];
  columns?: readonly Partial<CrosstabDimension>[];
  measures: readonly Partial<CrosstabMeasure>[];
  totalColumn?: boolean;
  totalRow?: boolean;
  totalLabel?: string;
  maxColumns?: number;
  [key: string]: unknown;
}

/** The table a crosstab becomes, before the normal table resolution runs on it. */
export interface PivotTable {
  columns: TableColumn[];
  headerRows?: TableHeaderCell[][];
  showFooter: boolean;
}

export interface PivotResult {
  table: PivotTable;
  /** One record per row group: r<i> for row values, c<col>m<measure> for cells, t<measure> for row totals. */
  rows: Record<string, unknown>[];
  /** Column values left out because of `maxColumns`. */
  truncatedColumns: number;
}

interface Accumulator {
  sum: number;
  count: number;
  min: number;
  max: number;
}

const empty = (): Accumulator => ({ sum: 0, count: 0, min: Infinity, max: -Infinity });

function add(acc: Accumulator, value: unknown, aggregate: Aggregate): void {
  if (aggregate === "count") {
    if (value !== null && value !== undefined && value !== "") acc.count += 1;
    return;
  }
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return;
  acc.sum += number;
  acc.count += 1;
  acc.min = Math.min(acc.min, number);
  acc.max = Math.max(acc.max, number);
}

function result(acc: Accumulator | undefined, aggregate: Aggregate): number | null {
  if (!acc || acc.count === 0) return aggregate === "count" ? (acc ? 0 : null) : null;
  switch (aggregate) {
    case "count":
      return acc.count;
    case "avg":
      return acc.sum / acc.count;
    case "min":
      return acc.min;
    case "max":
      return acc.max;
    default:
      return Math.round(acc.sum * 1e9) / 1e9;
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function sortKeys(keys: Key[], dimensions: readonly Partial<CrosstabDimension>[]): Key[] {
  return keys.sort((a, b) => {
    for (let i = 0; i < dimensions.length; i++) {
      const order = compare(a[i], b[i]) * (dimensions[i]!.sort === "desc" ? -1 : 1);
      if (order) return order;
    }
    return 0;
  });
}

const keyOf = (key: Key): string => JSON.stringify(key);
const label = (value: unknown): string => (value === null || value === undefined || value === "" ? "(blank)" : String(value));
const literal = (value: number | null): string => (value === null ? "null" : String(value));
/** "row.unit_price" -> "Unit price", "row.customer.name" -> "Name". */
const fieldTitle = (binding: string): string => {
  const words = (binding.split(".").pop() ?? binding).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : binding;
};

/**
 * Pivots `rows` into the shape of an ordinary table. `evaluate` reads a binding for one source row.
 * Totals are computed from the raw values (an average total is the average of all values, not of averages).
 */
export function pivotCrosstab(crosstab: CrosstabDefinition, sourceRows: readonly unknown[], evaluate: (binding: string, row: unknown) => unknown): PivotResult {
  const rowDims = crosstab.rows;
  const colDims = crosstab.columns ?? [];
  const measures = crosstab.measures.map((measure) => ({ ...measure, aggregate: (measure.aggregate ?? "sum") as Aggregate }));
  const totalColumn = crosstab.totalColumn ?? true;
  const totalRow = crosstab.totalRow ?? true;
  const totalLabel = crosstab.totalLabel ?? "Total";

  const rowKeys = new Map<string, Key>();
  const colKeys = new Map<string, Key>();
  // cell, row-total, column-total and grand-total accumulators, one per measure
  const cells = new Map<string, Accumulator[]>();
  const accumulators = (key: string) => {
    let list = cells.get(key);
    if (!list) cells.set(key, (list = measures.map(empty)));
    return list;
  };

  for (const source of sourceRows) {
    const rowKey = rowDims.map((dim) => evaluate(dim.binding!, source));
    const colKey = colDims.map((dim) => evaluate(dim.binding!, source));
    const r = keyOf(rowKey);
    const c = keyOf(colKey);
    rowKeys.set(r, rowKey);
    colKeys.set(c, colKey);
    const values = measures.map((measure) => evaluate(measure.binding!, source));
    for (const target of [`${r}|${c}`, `${r}|*`, `*|${c}`, "*|*"]) {
      accumulators(target).forEach((acc, i) => add(acc, values[i], measures[i]!.aggregate));
    }
  }

  const sortedRows = sortKeys([...rowKeys.values()], rowDims);
  const allColumns = sortKeys([...colKeys.values()], colDims);
  const maxColumns = crosstab.maxColumns ?? 60;
  const sortedColumns = allColumns.slice(0, maxColumns);
  const value = (r: string, c: string, m: number) => result(cells.get(`${r}|${c}`)?.[m], measures[m]!.aggregate);

  const rows = sortedRows.map((rowKey) => {
    const r = keyOf(rowKey);
    const record: Record<string, unknown> = {};
    rowKey.forEach((part, i) => (record[`r${i}`] = part));
    sortedColumns.forEach((colKey, ci) => measures.forEach((_, mi) => (record[`c${ci}m${mi}`] = value(r, keyOf(colKey), mi))));
    if (totalColumn) measures.forEach((_, mi) => (record[`t${mi}`] = value(r, "*", mi)));
    return record;
  });

  const several = measures.length > 1;
  const AGGREGATE_TITLES: Record<Aggregate, string> = { sum: "Total", count: "Count", avg: "Average", min: "Minimum", max: "Maximum" };
  const measureTitle = (mi: number) => measures[mi]!.header ?? (several ? `${AGGREGATE_TITLES[measures[mi]!.aggregate]} ${fieldTitle(measures[mi]!.binding!).toLowerCase()}` : undefined);
  const columnTitle = (colKey: Key) => colKey.map(label).join(" · ") || totalLabel;

  const columns: TableColumn[] = rowDims.map((dim, i) => ({
    id: `r${i}`,
    header: dim.header ?? fieldTitle(dim.binding!),
    binding: `row.r${i}`,
    format: dim.format,
    ...(i < rowDims.length - 1 ? { mergeRepeated: true } : {}),
    ...(totalRow && i === 0 ? { footer: { label: totalLabel } } : {}),
  }));
  sortedColumns.forEach((colKey, ci) =>
    measures.forEach((measure, mi) =>
      columns.push({
        id: `c${ci}m${mi}`,
        header: several ? measureTitle(mi) : columnTitle(colKey),
        binding: `row.c${ci}m${mi}`,
        align: "right",
        format: measure.format,
        ...(totalRow ? { footer: { expression: literal(value("*", keyOf(colKey), mi)) } } : {}),
      }),
    ),
  );
  if (totalColumn) {
    measures.forEach((measure, mi) =>
      columns.push({
        id: `t${mi}`,
        header: several ? measureTitle(mi) : totalLabel,
        binding: `row.t${mi}`,
        align: "right",
        format: measure.format,
        ...(totalRow ? { footer: { expression: literal(value("*", "*", mi)) } } : {}),
      }),
    );
  }

  const table: PivotTable = { columns, showFooter: totalRow };
  if (several) {
    // Column values on top spanning their measures; measure names underneath.
    const top: TableHeaderCell[] = rowDims.map((_, i) => ({ column: i, text: columns[i]!.header ?? "", colSpan: 1, rowSpan: 2 }));
    let at = rowDims.length;
    for (const colKey of [...sortedColumns, ...(totalColumn ? [[]] : [])]) {
      top.push({ column: at, text: colKey.length ? columnTitle(colKey) : totalLabel, colSpan: measures.length, rowSpan: 1, align: "center" });
      at += measures.length;
    }
    const second: TableHeaderCell[] = [];
    for (let column = rowDims.length; column < columns.length; column++) second.push({ column, text: columns[column]!.header ?? "", colSpan: 1, rowSpan: 1, align: "right" });
    table.headerRows = [top, second];
  }
  return { table, rows, truncatedColumns: allColumns.length - sortedColumns.length };
}
