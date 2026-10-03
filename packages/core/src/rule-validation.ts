import { componentSchema, sectionSchema, type Rule } from "@reporting/schema";
import { Parser } from "@reporting/expressions";
import { inferRulePhase, phaseRank, ruleCases, ruleExpressions } from "./rules.js";
import type { ValidationIssue } from "./validator.js";

/** Structure and identity cannot be changed by a rule. */
const RESERVED_TARGETS = new Set([
  "id", "type", "name", "locked", "rules", "styleWhen", "visibleWhen", "rowStyleWhen",
  "children", "dataset", "groupId", "groupBy", "parent", "appliesTo",
]);

export const PAGE_BAND_TYPES = new Set(["pageHeader", "pageFooter", "background"]);

type ZodLike = { _def: { typeName: string; [key: string]: any }; safeParse(value: unknown): { success: boolean } };

function unwrap(type: ZodLike | undefined): ZodLike | undefined {
  let current = type;
  for (let guard = 0; current && guard < 20; guard++) {
    const def = current._def;
    if (def.typeName === "ZodOptional" || def.typeName === "ZodNullable" || def.typeName === "ZodDefault") current = def.innerType;
    else if (def.typeName === "ZodEffects") current = def.schema;
    else if (def.typeName === "ZodLazy") current = def.getter();
    else return current;
  }
  return current;
}

function child(type: ZodLike | undefined, key: string): ZodLike | undefined {
  const t = unwrap(type);
  if (!t) return undefined;
  if (t._def.typeName === "ZodObject") return t._def.shape()[key];
  if (t._def.typeName === "ZodRecord") return t._def.valueType;
  if (t._def.typeName === "ZodUnion") {
    for (const option of t._def.options as ZodLike[]) {
      const found = child(option, key);
      if (found) return found;
    }
  }
  return undefined;
}

function componentType(type: string): ZodLike | undefined {
  const union = unwrap(componentSchema as unknown as ZodLike);
  if (union?._def.typeName !== "ZodDiscriminatedUnion") return undefined;
  return union._def.optionsMap.get(type);
}

const isExprValue = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as { expr?: unknown }).expr === "string";

/**
 * Validates the `rules` of a component (`ownerType` = its component type) or a band (`ownerType` = undefined).
 * `pageBand` is true when the rules belong to, or sit inside, a page header, footer or background.
 */
export function validateRules(
  rules: Rule[] | undefined,
  path: string,
  owner: { kind: "component"; type: string } | { kind: "band" },
  pageBand: boolean,
  issues: ValidationIssue[],
  componentId?: string,
): void {
  const schema = owner.kind === "band" ? (sectionSchema as unknown as ZodLike) : componentType(owner.type);
  const push = (code: string, where: string, message: string) => issues.push({ severity: "error", code, path: where, message, ...(componentId ? { componentId } : {}) });

  rules?.forEach((rule, index) => {
    const rulePath = `${path}.rules[${index}]`;
    for (const { expression, where } of ruleExpressions(rule)) {
      try {
        Parser.parse(expression);
      } catch (err) {
        push("INVALID_EXPRESSION", `${rulePath}.${where}`, err instanceof Error ? err.message : String(err));
      }
    }

    const assignments: [string, Record<string, unknown>][] = ruleCases(rule).map((c, caseIndex) => ["cases" in rule ? `cases[${caseIndex}].set` : "set", c.set]);
    if (rule.else) assignments.push(["else", rule.else]);
    for (const [where, set] of assignments) {
      for (const [key, value] of Object.entries(set)) {
        const keyPath = `${rulePath}.${where}.${key}`;
        if (RESERVED_TARGETS.has(key.split(".")[0]!)) {
          push("RULE_RESERVED_TARGET", keyPath, `A rule cannot change "${key}".`);
          continue;
        }
        if (key === "visible") {
          if (!isExprValue(value) && typeof value !== "boolean") push("RULE_INVALID_VALUE", keyPath, `"visible" must be true or false.`);
          continue;
        }
        if (!schema) continue;
        const target = key.split(".").reduce<ZodLike | undefined>((t, segment) => child(t, segment), schema);
        if (!target) {
          push("RULE_UNKNOWN_TARGET", keyPath, `"${key}" is not a property of this ${owner.kind === "band" ? "band" : `${owner.type} component`}.`);
          continue;
        }
        if (!isExprValue(value) && !target.safeParse(value).success) push("RULE_INVALID_VALUE", keyPath, `${JSON.stringify(value)} is not a valid value for "${key}".`);
      }
    }

    const inferred = inferRulePhase(rule);
    if (rule.phase && phaseRank(rule.phase) < phaseRank(inferred)) {
      push("RULE_PHASE_TOO_EARLY", rulePath, `This rule uses values that are only known in the ${inferred} phase, but it is set to run in the ${rule.phase} phase.`);
      return;
    }
    const phase = rule.phase ?? inferred;
    if (phase === "layout" || phase === "output" || phase === "print") {
      push("RULE_PHASE_UNSUPPORTED", rulePath, `Rules in the ${phase} phase are not supported yet.`);
    } else if (phase === "postLayout" && !pageBand) {
      push("RULE_PHASE_UNSUPPORTED", rulePath, "Rules that depend on page.* currently work only in page headers, footers and backgrounds.");
    }
  });
}
