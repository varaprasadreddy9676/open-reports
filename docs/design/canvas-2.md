# Canvas 2.0

Goal: a report canvas that feels as direct as Figma, with keyboard control for everything, and features only a report designer can have.

## Principles

- **Instant feedback.** Every input shows a visible result within one frame (16 ms). Layout and pagination catch up in the background; the canvas never waits for them.
- **Keyboard first.** Anything you can do with the mouse has a key. Keys follow Figma conventions so designers bring their muscle memory.
- **Never lose your place.** Zoom keeps the point under the cursor still; undo restores selection; panels do not jump.
- **Explain, don't hide.** Page breaks, overflows and bindings are visible on the canvas, not in a drawer.

## Phases

Each phase ships on its own, with tests, and is deployed to the demo.

Status: phases 1–3 and the delete effect are built and tested; phase 4's remaining items and phase 5 are next.

### 1. Navigation and responsiveness
- Trackpad pinch and Ctrl/⌘ + wheel zoom around the cursor; plain wheel scrolls; Shift + wheel scrolls sideways.
- Zoom steps from 10% to 800%. ⌘ + / ⌘ − step zoom, ⇧0 or ⌘0 actual size, ⇧1 fit page, ⇧2 zoom to selection.
- Optimistic geometry: moves and resizes from keys, the properties panel, align or undo appear immediately, before layout finishes.
- Drag performance: snapping context is computed once per drag, and unchanged elements do not re-render while dragging.

### 2. Keyboard model
- Arrows nudge 1 pt (Shift: 10 pt), as in Figma; ⌘ + arrows resize.
- Tab / Shift+Tab: next / previous sibling. Enter: into the container, or edit text. Shift+Enter or Esc: select parent.
- ⌘A selects siblings at the current level.
- Align: ⌥A left, ⌥D right, ⌥H centre, ⌥W top, ⌥S bottom, ⌥V middle. Distribute: ⌥⇧H, ⌥⇧V.
- Order: ⌘] forward, ⌘[ backward, ⌘⌥] to front, ⌘⌥[ to back.
- One shortcut registry drives the cheat sheet (?), the command palette and tooltips, with ⌘ on Mac and Ctrl elsewhere.

### 3. Direct manipulation
- Hover outline for the element under the cursor (already present; kept).
- Shift-drag locks to an axis; Shift-resize keeps proportions; Alt-resize resizes from the centre.
- Alt-drag duplicates (Figma); Shift+Alt-drag still works.
- Hold Alt with a selection to measure the distance to the hovered element.
- Dropped components keep their default size and move inside the page instead of shrinking.

### 4. Feel like a native app
- Delete crumbles the element into dust that blows away (skipped under reduced motion), with an Undo toast.
- Arrow cursor on objects; the hand is only for panning. Context menus and tooltips show ⌘ on a Mac.
- Next: a selection outline that glides between elements, spring-eased panels, and a zoom HUD.

### 5. Report-only superpowers
- Page breaks shown on the canvas with "Why here?" explanations.
- Data stress test on the canvas: empty, one row, sample, many rows, long text.

## Out of scope for now

Rotation, vector editing, multiplayer cursors, a WebGL renderer. The DOM canvas stays: it shares text metrics with the PDF renderer, which is what keeps the canvas and the PDF identical.
