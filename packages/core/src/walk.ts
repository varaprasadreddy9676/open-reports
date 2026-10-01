import type { ResolvedComponent, ResolvedReport } from "./resolved-report.js";

/** Depth-first walk over every component in a Resolved Report Tree,
 * including nested containers, groups (header/children/footer of every
 * group instance) and repeaters. Used by renderers (XLSX, CSV) that need to
 * find specific component types (tables) without duplicating tree-walking
 * logic, and by future diagnostics/linting. */
export function* walkComponents(report: ResolvedReport): Generator<ResolvedComponent> {
  for (const section of report.sections) {
    yield* walkList(section.children);
  }
}

function* walkList(components: ResolvedComponent[]): Generator<ResolvedComponent> {
  for (const component of components) {
    yield component;
    yield* walkChildrenOf(component);
  }
}

function* walkChildrenOf(component: ResolvedComponent): Generator<ResolvedComponent> {
  const anyComponent = component as any;
  if (Array.isArray(anyComponent.children)) {
    yield* walkList(anyComponent.children);
  }
  if (Array.isArray(anyComponent.groups)) {
    for (const group of anyComponent.groups) {
      yield* walkList(group.header ?? []);
      yield* walkList(group.children ?? []);
      yield* walkList(group.footer ?? []);
    }
  }
}

export function findComponentsByType<T extends ResolvedComponent["type"]>(
  report: ResolvedReport,
  type: T
): Extract<ResolvedComponent, { type: T }>[] {
  return [...walkComponents(report)].filter((c): c is Extract<ResolvedComponent, { type: T }> => c.type === type);
}
