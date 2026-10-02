# Hospital letterhead assets

These PNGs were cropped from the four PDFs supplied for practical header and
footer design. `manifest.json` records each source file, page, crop, pixel size,
and role. The images are test fixtures, not built-in Open Reports branding.

| Sample | Left brand lockup | Left symbol | Right accreditation mark | Full header/footer |
| --- | --- | --- | --- | --- |
| Radiology | `radiology-left-brand.png` | `radiology-left-symbol.png` | `radiology-right-accreditation.png` | `radiology-header-1.png`, `radiology-footer-1.png` |
| Discharge bill | `discharge-bill-left-brand.png` | `discharge-bill-left-symbol.png` | `discharge-bill-right-accreditation.png` | `discharge-bill-header-1.png`, `discharge-bill-footer-1.png` |
| Discharge summary | `discharge-summary-left-brand.png` | `discharge-summary-left-symbol.png` | `discharge-summary-right-accreditation.png` | `discharge-summary-header-1.png`, `discharge-summary-footer-1.png` |
| Laboratory | `laboratory-left-brand.png` | `laboratory-left-symbol.png` | `laboratory-right-accreditation.png` | `laboratory-header-1.png`, `laboratory-footer-1.png` |

To make your own A4 header in the designer:

1. Create a blank A4 report and add a **Page Header** in Structure.
2. Add a **Row** from Components into that band. With 10 mm left/right A4
   margins, set its width to 190 mm. Use **Side by side**, **Center** alignment,
   and **Space between** distribution.
3. Select the row and add an **Image**. Use **Upload image** in Properties to
   choose a left logo above. Set its width and height.
4. Select the row again to add editable **Text**, then another **Image** for a
   right logo. Resize and reorder the three children as needed.
5. Select the row and use **Save selection** under **My Components** to reuse
   the finished header in other reports. Preview the actual PDF before use.

For a direct reproduction, [the browser test](../../e2e/letterheads.spec.ts) builds the radiology
two-logo header through these UI controls, downloads a PDF, and checks that both
images and the editable title survived. The scanned discharge assets are softer
than the radiology and laboratory crops. Verify brand and accreditation usage
before publishing documents outside the test environment.
