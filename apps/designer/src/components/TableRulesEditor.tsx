import { useMemo, useState } from "react";
import { useStore } from "../store";
import { candidatesFor, type Candidate } from "../lib/bindings";
import { conditionToExpression } from "../lib/lowcode";
import { cardToRule, columnHideCondition, migratedRowRules, ruleToCard, withColumnHideCondition, type RuleCard, type TableRule } from "../lib/table-rules";
import { FormulaInput } from "./FormulaInput";
import { StyleRuleCard } from "./Properties";

type Kind = "row" | "cell";

/** If/Then rules for a table: whole rows (style or hide) and the cells of one column (style or replacement text). */
export function TableRulesEditor({ table }: { table: Record<string, any> }) {
  const { doc, sample } = useStore();
  const patch = useStore((state) => state.patch);
  const [columnIndex, setColumnIndex] = useState(0);
  // Table rules resolve before pagination, so page numbers are not offered.
  const candidates = useMemo(() => candidatesFor(doc, sample, table.id, table.dataset).filter((candidate) => candidate.group !== "Page"), [doc, sample, table.id, table.dataset]);
  const cellCandidates = useMemo<Candidate[]>(() => [{ value: "value", label: "This cell's value", group: "Cell" }, ...candidates], [candidates]);
  const columnCandidates = useMemo(() => candidates.filter((candidate) => !/^(row|parent|group)\./.test(candidate.value)), [candidates]);

  const rowRules = migratedRowRules(table);
  // Writing row rules also retires the legacy rowStyleWhen, which migratedRowRules has already folded in.
  const writeRows = (next: TableRule[]) => patch(table.id, { rowRules: next.length ? next : undefined, rowStyleWhen: undefined });

  const columns: Record<string, any>[] = table.columns ?? [];
  const index = Math.min(columnIndex, Math.max(0, columns.length - 1));
  const column = columns[index];
  const writeColumn = (next: Record<string, any>) => patch(table.id, { columns: columns.map((item, position) => (position === index ? next : item)) });
  const hideCondition = column ? columnHideCondition(column) : "";
  const cellRules: TableRule[] = (column?.rules ?? []).filter((rule: TableRule) => !(rule.when === hideCondition && rule.set?.visible === false && Object.keys(rule.set).length === 1));
  const writeCells = (next: TableRule[]) => column && writeColumn(withColumnHideCondition({ ...column, rules: next.length ? next : undefined }, hideCondition));

  return (
    <div className="table-rules" data-testid="table-rules">
      <div className="group-title">Rows</div>
      {table.rowStyleWhen?.length > 0 && <p className="field-hint" data-testid="legacy-row-rules">This table has older row conditions. They are shown below and become rules when you change anything here.</p>}
      <RuleList rules={rowRules} kind="row" candidates={candidates} testId="table-row-rules" onChange={writeRows} />

      <div className="group-title">Cells</div>
      {columns.length === 0 ? <p className="muted small">Add a column first.</p> : <>
        <label className="field">
          <span className="field-label">Column</span>
          <select aria-label="Rules column" data-testid="rules-column" value={index} onChange={(event) => setColumnIndex(Number(event.target.value))}>
            {columns.map((item, position) => <option key={item.id ?? position} value={position}>{item.header || item.id || `Column ${position + 1}`}</option>)}
          </select>
        </label>
        <RuleList rules={cellRules} kind="cell" candidates={cellCandidates} testId="table-cell-rules" onChange={writeCells} />
        <label className="field">
          <span className="field-label">Hide column when</span>
          <FormulaInput value={hideCondition} candidates={columnCandidates} testId="column-hide-when" placeholder="e.g. !params.showCost" onChange={(condition) => writeColumn(withColumnHideCondition(column!, condition))} />
        </label>
        <p className="muted small">Decided once per report run, so it can use parameters and variables but not the row.</p>
      </>}
    </div>
  );
}

function RuleList({ rules, kind, candidates, testId, onChange }: { rules: TableRule[]; kind: Kind; candidates: Candidate[]; testId: string; onChange: (rules: TableRule[]) => void }) {
  const update = (index: number, rule: TableRule) => onChange(rules.map((current, i) => (i === index ? rule : current)));
  const remove = (index: number) => onChange(rules.filter((_, i) => i !== index));
  const move = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= rules.length) return;
    const next = [...rules];
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange(next);
  };
  const add = () => {
    const flag = candidates.find((candidate) => candidate.value === "row.flag")?.value;
    const when = kind === "cell"
      ? conditionToExpression({ field: "value", operator: "lt", value: "0" })
      : flag ? conditionToExpression({ field: flag, operator: "eq", value: "H" })
      : candidates[0] ? conditionToExpression({ field: candidates[0].value, operator: "eq", value: "" }) : "true";
    onChange([...rules, cardToRule({ when, style: { color: "#b91c1c", fontWeight: "bold" } })]);
  };
  return (
    <div className="style-rules" data-testid={testId}>
      {rules.length === 0 && <p className="muted small">{kind === "row" ? "Change a whole row's appearance, or leave it out, when its data matches." : "Change this column's cells, or what they print, when the cell's value or row matches."}</p>}
      {rules.map((rule, index) => {
        const card = ruleToCard(rule);
        if (!card) return <div key={index} className="column-card style-rule-card" data-testid={`${testId}-${index}`}>
          <div className="column-head">
            <strong>Rule {index + 1}</strong>
            <span className="muted small">Advanced rule: edit it in Code</span>
            <span className="spacer" />
            <button className="mini danger" aria-label={`Remove rule ${index + 1}`} onClick={() => remove(index)}>×</button>
          </div>
        </div>;
        const change = (next: RuleCard) => update(index, cardToRule(next));
        return <StyleRuleCard key={index} rule={card} index={index} count={rules.length} candidates={candidates} testId={testId} onChange={change} onMove={(direction) => move(index, direction)} onRemove={() => remove(index)}>
          {kind === "row" && <label className="check"><input type="checkbox" aria-label={`Rule ${index + 1} hide row`} checked={!!card.hide} onChange={(event) => change({ ...card, hide: event.target.checked || undefined })} /> Leave the row out</label>}
          {kind === "cell" && <label className="field">
            <span className="field-label">Print instead</span>
            <input aria-label={`Rule ${index + 1} replacement text`} placeholder="Keep the value" value={card.text ?? ""} onChange={(event) => change({ ...card, text: event.target.value === "" ? undefined : event.target.value })} />
          </label>}
        </StyleRuleCard>;
      })}
      <button className="btn" data-testid={`${testId}-add`} onClick={add}>+ Add rule</button>
      {rules.length > 1 && <p className="muted small">Rules run from top to bottom; a later match overrides earlier values.</p>}
    </div>
  );
}
