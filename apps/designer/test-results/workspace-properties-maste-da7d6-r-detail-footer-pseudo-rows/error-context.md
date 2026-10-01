# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workspace.spec.ts >> properties, masters, print, blocks >> layers: rename, hide and lock rows; table shows header/detail/footer pseudo rows
- Location: tests/e2e/workspace.spec.ts:159:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByTestId('layer-rename')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - toolbar "Main toolbar" [ref=e4]:
    - generic [ref=e5]:
      - generic [aria-hidden] [ref=e6]: ▤
      - button "Reports" [ref=e7] [cursor=pointer]
      - generic [ref=e8]: /
      - textbox "Report name" [ref=e9]: Invoice
      - generic [ref=e10]: unsaved
      - generic [ref=e11]: Draft kept locally
    - generic [ref=e12]:
      - button "Undo" [ref=e13] [cursor=pointer]: ↶
      - button "Redo" [disabled] [ref=e14]: ↷
      - button "Zoom out" [ref=e16] [cursor=pointer]: −
      - generic [ref=e17]: 100%
      - button "Zoom in" [ref=e18] [cursor=pointer]: +
      - button "Fit to width" [ref=e19] [cursor=pointer]: ⤢
      - button "Zoom to selection" [ref=e20] [cursor=pointer]: ◎
      - button "Actual size" [ref=e21] [cursor=pointer]: 1:1
      - button "View ▾" [ref=e24] [cursor=pointer]
    - tablist "Editor mode" [ref=e25]:
      - tab "Design" [selected] [ref=e26] [cursor=pointer]
      - tab "Data" [ref=e27] [cursor=pointer]
      - tab "Code" [ref=e28] [cursor=pointer]
      - tab "Preview" [ref=e29] [cursor=pointer]
      - button "◫" [ref=e30] [cursor=pointer]
    - generic [ref=e31]:
      - generic "Choose which output to design for; the editor warns about anything it can't express" [ref=e32]:
        - generic [ref=e33]: Target
        - combobox "Target" [ref=e34]:
          - option "PDF" [selected]
          - option "HTML"
          - option "Excel"
          - option "CSV (data)"
          - option "Label (ZPL)"
      - button "⌘K" [ref=e35] [cursor=pointer]
      - button "Export ▾" [ref=e37] [cursor=pointer]
      - button "▶ Preview" [ref=e38] [cursor=pointer]
      - button "Save" [ref=e39] [cursor=pointer]
      - button "Publish" [ref=e40] [cursor=pointer]
      - button "More" [ref=e42] [cursor=pointer]: ⋯
  - generic [ref=e43]:
    - complementary "Insert, data and layers" [ref=e44]:
      - tablist [ref=e45]:
        - tab "Components" [ref=e46] [cursor=pointer]
        - tab "Layers" [selected] [ref=e47] [cursor=pointer]
        - tab "Data" [ref=e48] [cursor=pointer]
        - tab "Pages" [ref=e49] [cursor=pointer]
      - generic [ref=e50]:
        - generic [ref=e51] [cursor=pointer]: Invoice
        - generic [ref=e52]:
          - generic [ref=e53] [cursor=pointer]:
            - generic [ref=e54]: Page header
            - button "Remove pageHeader section" [ref=e55]: ×
          - generic [ref=e56]:
            - generic [ref=e57] [cursor=pointer]:
              - generic [ref=e58]: ▾
              - generic [ref=e61]: Row
            - generic [ref=e63] [cursor=pointer]:
              - generic [ref=e66]: ACME HEALTH
              - generic [ref=e67]:
                - button "Lock" [ref=e68]: 🔓
                - button "Show" [ref=e69]: 🙈
            - generic [ref=e70]: INVOICE
          - generic [ref=e75]: Line
        - generic [ref=e79]:
          - generic [ref=e80] [cursor=pointer]:
            - generic [ref=e81]: Body
            - button "Remove detail section" [ref=e82]: ×
          - generic [ref=e83]: Spacer
          - generic [ref=e88]:
            - generic [ref=e89] [cursor=pointer]:
              - generic [ref=e90]: ▾
              - generic [ref=e93]: Row
            - generic [ref=e94]:
              - generic [ref=e95] [cursor=pointer]:
                - generic [ref=e96]: ▾
                - generic [ref=e99]: Column
              - generic [ref=e100]: Bill to
              - generic [ref=e105]: data.invoice.customer.name
              - generic [ref=e110]: data.invoice.customer.addr…
              - generic [ref=e115]: data.invoice.customer.phone
            - generic [ref=e120]:
              - generic [ref=e121] [cursor=pointer]:
                - generic [ref=e122]: ▾
                - generic [ref=e125]: Column
              - generic [ref=e126]: "\"Invoice # \" + data.invoic…"
              - generic [ref=e131]: "\"Date: \" + formatDate(data…"
              - generic [ref=e136]: "\"Status: \" + data.invoice.…"
          - generic [ref=e141]: Spacer
          - generic [ref=e146]:
            - generic [ref=e147] [cursor=pointer]:
              - generic [ref=e148]: ▾
              - generic [ref=e151]: Table · invoice.items
            - generic [ref=e152]:
              - generic [ref=e153]: ▤
              - generic [ref=e154]: Header row
            - generic [ref=e155]:
              - generic [ref=e156]: ▤
              - generic [ref=e157]: Detail rows · invoice.items
            - generic [ref=e158]:
              - generic [ref=e159]: ▤
              - generic [ref=e160]: Footer row
          - generic [ref=e161]: Spacer
          - generic [ref=e166]:
            - generic [ref=e167] [cursor=pointer]:
              - generic [ref=e168]: ▾
              - generic [ref=e171]: KeepTogether
            - generic [ref=e172]:
              - generic [ref=e173] [cursor=pointer]:
                - generic [ref=e174]: ▾
                - generic [ref=e177]: Row
              - generic [ref=e178]: QR code
              - generic [ref=e183]:
                - generic [ref=e184] [cursor=pointer]:
                  - generic [ref=e185]: ▾
                  - generic [ref=e188]: Column
                - generic [ref=e189]:
                  - generic [ref=e190] [cursor=pointer]:
                    - generic [ref=e191]: ▾
                    - generic [ref=e194]: Row
                  - generic [ref=e195]: Subtotal
                  - generic [ref=e200]: formatCurrency(vars.subtot…
                - generic [ref=e205]:
                  - generic [ref=e206] [cursor=pointer]:
                    - generic [ref=e207]: ▾
                    - generic [ref=e210]: Row
                  - generic [ref=e211]: GST 18%
                  - generic [ref=e216]: formatCurrency(vars.tax)
                - generic [ref=e221]: Line
                - generic [ref=e225]:
                  - generic [ref=e226] [cursor=pointer]:
                    - generic [ref=e227]: ▾
                    - generic [ref=e230]: Row
                  - generic [ref=e231]: Total
                  - generic [ref=e236]: formatCurrency(vars.total)
        - generic [ref=e241]:
          - generic [ref=e242] [cursor=pointer]:
            - generic [ref=e243]: Page footer
            - button "Remove pageFooter section" [ref=e244]: ×
          - generic [ref=e245]: "\"Page \" + page.number + \" …"
        - generic [ref=e250]:
          - generic [ref=e251]: Add section
          - combobox "Add section" [ref=e252]:
            - option "Choose..." [selected]
            - option "Report header"
            - option "Body"
            - option "Report footer"
    - region "Workspace" [ref=e253]:
      - button "Hide insert panel" [ref=e254] [cursor=pointer]: ‹
      - button "Hide properties" [ref=e255] [cursor=pointer]: ›
      - generic [ref=e259]:
        - generic: Page header
        - generic: Body
        - generic: Page footer
        - generic: 155 mm free
        - generic [ref=e261]: INVOICE
        - generic [ref=e266]: Bill to
        - generic [ref=e267]: Sai Varaprasad
        - generic [ref=e268]: 12 MG Road, Bengaluru 560001
        - generic [ref=e269]: +91 98765 43210
        - generic [ref=e271]: "Invoice # INV-1001"
        - generic [ref=e272]: "Date: 15 Jan 2025"
        - generic [ref=e273]: "Status: Due"
        - table [ref=e275]:
          - rowgroup [ref=e281]:
            - row [ref=e282]:
              - columnheader "Description" [ref=e283]
              - columnheader "Qty" [ref=e284]
              - columnheader "Rate" [ref=e285]
              - columnheader "Amount" [ref=e286]
          - rowgroup [ref=e287]:
            - row [ref=e288]:
              - cell "Eye Examination" [ref=e289]
              - cell "1" [ref=e290]
              - cell "₹500.00" [ref=e291]
              - cell "₹500.00" [ref=e292]
            - row [ref=e293]:
              - cell "Progressive Lenses" [ref=e294]
              - cell "2" [ref=e295]
              - cell "₹3,200.00" [ref=e296]
              - cell "₹6,400.00" [ref=e297]
            - row [ref=e298]:
              - cell "Titanium Frame" [ref=e299]
              - cell "1" [ref=e300]
              - cell "₹4,800.00" [ref=e301]
              - cell "₹4,800.00" [ref=e302]
            - row [ref=e303]:
              - cell "Lens Coating" [ref=e304]
              - cell "2" [ref=e305]
              - cell "₹650.00" [ref=e306]
              - cell "₹1,300.00" [ref=e307]
          - rowgroup [ref=e308]:
            - row [ref=e309]:
              - cell [ref=e310]
              - cell [ref=e311]
              - cell [ref=e312]
              - cell "₹13,000.00" [ref=e313]
        - generic [ref=e322]: Subtotal
        - generic [ref=e323]: ₹13,000.00
        - generic [ref=e325]: GST 18%
        - generic [ref=e326]: ₹2,340.00
        - generic [ref=e329]: Total
        - generic [ref=e330]: ₹15,340.00
        - generic [ref=e331]: Page 1 of 1
        - generic [ref=e332]: Page 1 / 1
    - complementary "Properties" [ref=e333]:
      - generic [ref=e334]:
        - strong [ref=e335]: Report
        - generic [ref=e336]: Select an element to edit it
      - generic [ref=e337]:
        - button "▾ Report" [expanded] [ref=e338] [cursor=pointer]
        - generic [ref=e339]:
          - generic [ref=e340]:
            - generic [ref=e341]: Name
            - textbox "Report name" [ref=e342]: Invoice
          - generic [ref=e343]:
            - generic [ref=e344]: Id
            - textbox "Report id" [ref=e345]: invoice-sjkf
          - generic [ref=e346]:
            - generic [ref=e347]: Description
            - textbox "Description" [ref=e348]: Logo block, customer details, item table, tax and totals, QR code, repeating footer.
      - generic [ref=e349]:
        - button "▾ Page" [expanded] [ref=e350] [cursor=pointer]
        - generic [ref=e351]:
          - generic [ref=e352]:
            - generic [ref=e353]:
              - generic [ref=e354]: Size
              - combobox "Page size" [ref=e355]:
                - option "A4" [selected]
                - option "A3"
                - option "A5"
                - option "Letter"
                - option "Legal"
                - option "custom"
            - generic [ref=e356]:
              - generic [ref=e357]: Orientation
              - combobox "Orientation" [ref=e358]:
                - option "Portrait" [selected]
                - option "Landscape"
          - generic [ref=e359]:
            - generic [ref=e360]:
              - generic [ref=e361]: Top
              - spinbutton "Margin top" [ref=e362]: "15"
            - generic [ref=e363]:
              - generic [ref=e364]: Right
              - spinbutton "Margin right" [ref=e365]: "15"
            - generic [ref=e366]:
              - generic [ref=e367]: Bottom
              - spinbutton "Margin bottom" [ref=e368]: "18"
            - generic [ref=e369]:
              - generic [ref=e370]: Left
              - spinbutton "Margin left" [ref=e371]: "15"
      - button "▸ Headers & footers" [ref=e373] [cursor=pointer]
      - button "▸ Print & labels" [ref=e375] [cursor=pointer]
      - button "▸ Locale & theme" [ref=e377] [cursor=pointer]
  - contentinfo [ref=e378]:
    - tablist "Panels" [ref=e379]:
      - tab "Problems" [ref=e380] [cursor=pointer]
      - tab "Pagination" [ref=e381] [cursor=pointer]
      - tab "History" [ref=e382] [cursor=pointer]
    - generic [ref=e383]:
      - generic [ref=e384]: 0 errors
      - generic [ref=e385]: 0 warnings
      - generic [ref=e386]: 0 suggestions
      - generic [ref=e387]: 1 page
```

# Test source

```ts
  68  | 
  69  |     await page.keyboard.press("Control+Shift+g");
  70  |     d = await doc(page);
  71  |     expect(d.sections[0].children[0].children.some((c: any) => c.id === "title")).toBe(true);
  72  | 
  73  |     await page.evaluate(() => (window as any).__designer.getState().select(["date"]));
  74  |     await page.keyboard.press("Control+l");
  75  |     expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "date").locked).toBe(true);
  76  |     await page.keyboard.press("Control+l");
  77  |     await page.keyboard.press("Control+Shift+h");
  78  |     expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "date").hidden).toBe(true);
  79  |   });
  80  | 
  81  |   test("right-click opens the context menu with actions", async ({ page }) => {
  82  |     await absoluteForm(page);
  83  |     await page.locator('[data-cid="title"]').first().click({ button: "right" });
  84  |     await expect(page.getByTestId("context-menu")).toBeVisible();
  85  |     await page.getByTestId("ctx-lock").click();
  86  |     expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "title").locked).toBe(true);
  87  |   });
  88  | 
  89  |   test("double-click edits static text in place", async ({ page }) => {
  90  |     await page.goto("/");
  91  |     await page.getByTestId("starter-blank").click();
  92  |     await page.getByTestId("palette-text").click();
  93  |     const id = (await st(page)).selection[0];
  94  |     await expect(page.locator(`[data-cid="${id}"]`).first()).toContainText("New text");
  95  |     await page.waitForTimeout(300);
  96  |     await page.locator(`[data-cid="${id}"]`).first().dblclick();
  97  |     const editor = page.getByTestId("inline-editor");
  98  |     await expect(editor).toBeVisible();
  99  |     await editor.fill("Hello patients");
  100 |     await editor.press("Enter");
  101 |     await expect(page.getByTestId("canvas")).toContainText("Hello patients");
  102 |   });
  103 | 
  104 |   test("floating toolbar changes text style", async ({ page }) => {
  105 |     await page.goto("/");
  106 |     await page.getByTestId("starter-blank").click();
  107 |     await page.getByTestId("palette-text").click();
  108 |     await page.getByTestId("ft-bold").click();
  109 |     const d = await doc(page);
  110 |     expect(JSON.stringify(d)).toContain('"fontWeight":"bold"');
  111 |   });
  112 | 
  113 |   test("marquee selects several elements; alt-drag duplicates; guides snap", async ({ page }) => {
  114 |     await absoluteForm(page);
  115 |     await page.waitForTimeout(400);
  116 |     const pageBox = (await page.getByTestId("page-1").boundingBox())!;
  117 |     await page.mouse.move(pageBox.x + 3, pageBox.y + 3);
  118 |     await page.mouse.down();
  119 |     await page.mouse.move(pageBox.x + pageBox.width - 3, pageBox.y + pageBox.height / 2, { steps: 6 });
  120 |     await page.mouse.up();
  121 |     expect((await st(page)).selection.length).toBeGreaterThan(1);
  122 | 
  123 |     // alt-drag a single element: original stays, a copy is created
  124 |     await page.evaluate(() => (window as any).__designer.getState().select([]));
  125 |     const before = (await doc(page)).sections[0].children[0].children.length;
  126 |     const el = (await page.locator('[data-cid="date"]').first().boundingBox())!;
  127 |     await page.keyboard.down("Alt");
  128 |     await page.mouse.move(el.x + 4, el.y + 4);
  129 |     await page.mouse.down();
  130 |     await page.mouse.move(el.x + 40, el.y + 70, { steps: 6 });
  131 |     await page.mouse.up();
  132 |     await page.keyboard.up("Alt");
  133 |     expect((await doc(page)).sections[0].children[0].children.length).toBe(before + 1);
  134 |   });
  135 | 
  136 |   test("clicking a diagnostics badge opens Problems; one-click fix for an oversized element", async ({ page }) => {
  137 |     await absoluteForm(page);
  138 |     await page.evaluate(() => {
  139 |       const s = (window as any).__designer.getState();
  140 |       s.patch("title", { width: 900 });
  141 |     });
  142 |     await page.getByTestId("toggle-problems").click();
  143 |     await expect(page.getByTestId("problem-fix").first()).toBeVisible({ timeout: 8000 });
  144 |     await page.getByTestId("problem-fix").first().click();
  145 |     expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "title").width).toBeLessThan(900);
  146 |     await expect(page.getByTestId("problem-fix")).toHaveCount(0, { timeout: 8000 });
  147 |   });
  148 | 
  149 |   test("pages tab shows thumbnails that jump to a page", async ({ page }) => {
  150 |     await page.goto("/");
  151 |     await page.getByTestId("starter-account-statement").click();
  152 |     await page.getByTestId("left-tab-pages").click();
  153 |     await expect(page.getByTestId("page-thumb").first()).toBeVisible();
  154 |     await expect.poll(() => page.getByTestId("page-thumb").count()).toBeGreaterThan(1);
  155 |   });
  156 | });
  157 | 
  158 | test.describe("properties, masters, print, blocks", () => {
  159 |   test("layers: rename, hide and lock rows; table shows header/detail/footer pseudo rows", async ({ page }) => {
  160 |     await page.goto("/");
  161 |     await page.getByTestId("starter-invoice").click();
  162 |     await page.getByTestId("left-tab-layers").click();
  163 |     await page.getByTestId("layer-company").hover();
  164 |     await page.getByTestId("hide-company").click();
  165 |     expect((await doc(page)).sections[0].children[0].children[0].hidden).toBe(true);
  166 |     await page.getByTestId("layer-company").press("F2").catch(() => {});
  167 |     await page.evaluate(() => (window as any).__designer.getState().set({ editingText: "company" }));
> 168 |     await page.getByTestId("layer-rename").fill("Company name");
      |                                            ^ Error: locator.fill: Test timeout of 60000ms exceeded.
  169 |     await page.getByTestId("layer-rename").press("Enter");
  170 |     expect(JSON.stringify(await doc(page))).toContain('"name":"Company name"');
  171 |     await expect(page.getByTestId("layers-tab")).toContainText("Header row");
  172 |   });
  173 | 
  174 |   test("layout inspector edits margin, padding and size limits; calculated-value builder writes the expression", async ({ page }) => {
  175 |     await page.goto("/");
  176 |     await page.getByTestId("starter-blank").click();
  177 |     await page.getByTestId("palette-text").click();
  178 |     await page.getByLabel("Margin top").fill("6");
  179 |     await page.getByLabel("Padding left").fill("4");
  180 |     const d = JSON.stringify(await doc(page));
  181 |     expect(d).toContain('"margin":{"top":6');
  182 |     expect(d).toContain('"padding":{"top":0,"right":0,"bottom":0,"left":4}');
  183 | 
  184 |     await page.getByTestId("value-mode-formula").click();
  185 |     await page.getByTestId("formula-input").fill("params.a * params.b");
  186 |     await page.getByTestId("calc-view-builder").click();
  187 |     await expect(page.getByTestId("calc-builder")).toBeVisible();
  188 |     await page.getByTestId("calc-add").click();
  189 |     expect(JSON.stringify(await doc(page))).toMatch(/params\.a \* params\.b [+] /);
  190 |   });
  191 | 
  192 |   test("page masters: different first page is added from the page panel", async ({ page }) => {
  193 |     await page.goto("/");
  194 |     await page.getByTestId("starter-invoice").click();
  195 |     await page.evaluate(() => (window as any).__designer.getState().select([]));
  196 |     await page.getByRole("button", { name: /Headers & footers/ }).click();
  197 |     await page.getByTestId("master-add-pageHeader-first").click();
  198 |     const sections = (await doc(page)).sections;
  199 |     expect(sections.some((s: any) => s.type === "pageHeader" && s.appliesTo === "first")).toBe(true);
  200 |     await page.getByTestId("master-remove-pageHeader-first").click();
  201 |     expect((await doc(page)).sections.some((s: any) => s.appliesTo === "first")).toBe(false);
  202 |   });
  203 | 
  204 |   test("print profile: preset sets page size and dpi; ZPL preview shows source and download", async ({ page }) => {
  205 |     await page.goto("/");
  206 |     await page.getByTestId("starter-blank").click();
  207 |     await page.evaluate(() => (window as any).__designer.getState().select([]));
  208 |     await page.getByRole("button", { name: /Print & labels/ }).click();
  209 |     await page.getByTestId("print-preset").selectOption({ label: "Label 50 × 30 mm (ZPL 203 dpi)" });
  210 |     const d = await doc(page);
  211 |     expect(d.print).toMatchObject({ printerType: "label", language: "zpl", dpi: 203 });
  212 |     expect(d.page.width).toBe(50);
  213 |     await expect(page.getByTestId("print-facts")).toContainText("50.0 × 30.0 mm");
  214 |     await page.getByTestId("palette-qr-code").click();
  215 |     await page.getByTestId("mode-preview").click();
  216 |     await page.getByTestId("preview-tab-zpl").click();
  217 |     await expect(page.getByTestId("zpl-text")).toContainText("^XA");
  218 |     await expect(page.getByTestId("zpl-info")).toContainText("203 dpi");
  219 |   });
  220 | 
  221 |   test("label starter: barcode too small gets a one-click fix", async ({ page }) => {
  222 |     await page.goto("/");
  223 |     await page.getByTestId("starter-search").fill("pharmacy");
  224 |     await page.getByTestId("starter-pharmacy-label").click();
  225 |     await page.evaluate(() => {
  226 |       const s = (window as any).__designer.getState();
  227 |       s.patch("rx-qr", { width: 12, height: 12 });
  228 |     });
  229 |     await page.getByTestId("toggle-problems").click();
  230 |     await expect(page.getByTestId("problems")).toContainText(/QR code .* should be at least/, { timeout: 8000 });
  231 |     await page.getByTestId("problem-fix").first().click();
  232 |     expect(JSON.stringify(await doc(page))).not.toContain('"width":12,"height":12');
  233 |   });
  234 | 
  235 |   test("My Components: save a selection as a reusable block and insert it again", async ({ page }) => {
  236 |     await page.goto("/");
  237 |     await page.getByTestId("starter-blank").click();
  238 |     await page.getByTestId("palette-text").click();
  239 |     await page.getByTestId("save-block").click();
  240 |     await page.getByTestId("block-name").fill("Letterhead " + Date.now().toString(36));
  241 |     await page.getByTestId("block-save").click();
  242 |     await expect(page.getByTestId("my-components").locator(".block-item").first()).toBeVisible();
  243 |     const before = (await doc(page)).sections[0].children.length;
  244 |     await page.getByTestId("my-components").locator(".block-item").first().click();
  245 |     expect((await doc(page)).sections[0].children.length).toBe(before + 1);
  246 |   });
  247 | 
  248 |   test("new-report dialog: size picker and template search", async ({ page }) => {
  249 |     await page.goto("/");
  250 |     await page.getByTestId("blank-size").selectOption({ label: "Receipt 58 mm" });
  251 |     await page.getByTestId("starter-blank").click();
  252 |     expect((await doc(page)).page.width).toBe(58);
  253 |     await page.getByTestId("btn-more").click();
  254 |     await page.getByTestId("btn-new").click();
  255 |     await page.getByTestId("starter-search").fill("wristband");
  256 |     await expect(page.getByTestId("starter-wristband")).toBeVisible();
  257 |     await expect(page.getByTestId("starter-invoice")).toHaveCount(0);
  258 |   });
  259 | });
  260 | 
  261 | test.describe("data and code tooling", () => {
  262 |   test("CodeMirror shows schema errors as squiggles and offers key completions", async ({ page }) => {
  263 |     await page.goto("/");
  264 |     await page.getByTestId("starter-blank").click();
  265 |     await page.getByTestId("mode-code").click();
  266 |     await expect(page.locator(".cm-editor")).toBeVisible();
  267 |     await page.evaluate(() => {
  268 |       const v = (window as any).__codeView;
```