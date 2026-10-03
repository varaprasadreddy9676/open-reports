import { z } from "zod";

/**
 * Universal conditional rules. A rule changes properties of the component or band it is declared on when its
 * condition holds; anything the schema allows on that object may be set. Rules run in order and a later rule's
 * value wins. Conditions are safe expressions (no JavaScript) or a structured tree the low-code builder edits.
 */

export const comparisonOperatorSchema = z.enum([
  "==", "!=", ">", ">=", "<", "<=",
  "contains", "notContains", "startsWith", "endsWith",
  "in", "notIn", "isEmpty", "isNotEmpty",
]);
export type ComparisonOperator = z.infer<typeof comparisonOperatorSchema>;

export type Condition =
  | string
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: ComparisonOperator; value?: unknown };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    /** A safe expression, e.g. `row.flag == "H" && params.showFlags`. */
    z.string().min(1),
    z.object({ all: z.array(conditionSchema).min(1) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1) }).strict(),
    z.object({ not: conditionSchema }).strict(),
    /** `field` is an expression (usually a path like `row.flag`); `value` is a literal (an array for in/notIn). */
    z.object({ field: z.string().min(1), op: comparisonOperatorSchema, value: z.unknown().optional() }).strict(),
  ]),
);

/** A computed value; any other value is used literally. */
export const ruleExpressionValueSchema = z.object({ expr: z.string().min(1) }).strict();

/**
 * Property path → value, relative to the object the rule is declared on: `"style.color"`, `"visible"`,
 * `"value"`, `"keepTogether"`, `"newPageBefore"`. `visible` is a virtual property (false hides the object).
 * Setting one of `value` / `binding` / `expression` replaces the content and clears the other two.
 */
export const ruleAssignmentsSchema = z.record(z.string().min(1), z.unknown());
export type RuleAssignments = z.infer<typeof ruleAssignmentsSchema>;

/**
 * When the rule can be decided. Inferred from what the rule references when omitted:
 * data/preLayout from parameters, data, rows and groups; postLayout once pages are known (`page.*`);
 * output/print from the target format or print job (`renderer.*`, `print.*`).
 */
export const rulePhaseSchema = z.enum(["data", "preLayout", "layout", "postLayout", "output", "print"]);
export type RulePhase = z.infer<typeof rulePhaseSchema>;

const ruleMetaShape = {
  id: z.string().optional(),
  /** Shown in the condition builder and the condition debugger. */
  name: z.string().optional(),
  phase: rulePhaseSchema.optional(),
  /** Keep the rule but skip it. */
  disabled: z.boolean().optional(),
};

/** IF `when` THEN `set` [ELSE `else`]. */
export const simpleRuleSchema = z.object({
  ...ruleMetaShape,
  when: conditionSchema,
  set: ruleAssignmentsSchema,
  else: ruleAssignmentsSchema.optional(),
}).strict();

/** IF / ELSE IF / … / ELSE: the first case whose condition holds applies; otherwise `else`. */
export const caseRuleSchema = z.object({
  ...ruleMetaShape,
  cases: z.array(z.object({ when: conditionSchema, set: ruleAssignmentsSchema }).strict()).min(1),
  else: ruleAssignmentsSchema.optional(),
}).strict();

export const ruleSchema = z.union([simpleRuleSchema, caseRuleSchema]);
export type Rule = z.infer<typeof ruleSchema>;
export type SimpleRule = z.infer<typeof simpleRuleSchema>;
export type CaseRule = z.infer<typeof caseRuleSchema>;

export const rulesSchema = z.array(ruleSchema);
