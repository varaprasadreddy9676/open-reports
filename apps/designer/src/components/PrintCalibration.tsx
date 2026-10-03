import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { calibrationFromMeasurements, zplCalibrationPattern } from "../lib/print-calibration";
import { downloadBlob } from "./Preview";

/** A small, optional calibration workflow for ZPL media. The test box is raw. */
export function PrintCalibration() {
  const doc = useStore((state) => state.doc);
  const setDoc = useStore((state) => state.setDoc);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [offsetX, setOffsetX] = useState("");
  const [offsetY, setOffsetY] = useState("");
  const dpi = doc.print?.dpi ?? 203;
  const result = useMemo(() => {
    try { return { pattern: zplCalibrationPattern(doc.page, dpi, doc.print?.safeMargin ?? 0) }; }
    catch (reason) { return { error: (reason as Error).message }; }
  }, [doc.page, dpi, doc.print?.safeMargin]);
  const pattern = result.pattern;
  useEffect(() => { setWidth(""); setHeight(""); setOffsetX(""); setOffsetY(""); }, [pattern?.zpl]);
  const current = doc.print?.calibration;
  let candidate: ReturnType<typeof calibrationFromMeasurements> | undefined;
  let inputError = "";
  if (pattern && width.trim()) {
    try { candidate = calibrationFromMeasurements(pattern, Number(width), height.trim() ? Number(height) : undefined, Number(offsetX || 0), Number(offsetY || 0)); }
    catch (reason) { inputError = (reason as Error).message; }
  }
  const apply = () => {
    if (!candidate) return;
    setDoc({ ...doc, print: { ...doc.print, calibration: candidate } });
    useStore.getState().toast("ZPL correction applied to this report. Save these settings as a printer profile to reuse them.", "success");
  };
  return <details className="calibration-panel" data-testid="calibration-panel">
    <summary>Calibrate ZPL printer</summary>
    <p className="field-hint">Print the uncorrected test label on this printer. Measure the outer edges of the black box, then enter the lengths below. This changes ZPL output only; the design canvas and PDF keep their nominal dimensions.</p>
    {result.error ? <p className="field-hint" role="alert">{result.error}</p> : pattern && <>
      <p className="field-hint" data-testid="calibration-expected">Expected box: <strong>{pattern.expectedWidthMm.toFixed(2)} × {pattern.expectedHeightMm.toFixed(2)} mm</strong> at {dpi} dpi.</p>
      <button className="btn" type="button" data-testid="calibration-download" onClick={() => downloadBlob(new Blob([pattern.zpl], { type: "text/plain" }), `calibration-${Math.round(pattern.widthDots * 25.4 / dpi)}x${Math.round(pattern.heightDots * 25.4 / dpi)}-${dpi}dpi.zpl`)}>Download test .zpl</button>
      <div className="grid2 calibration-fields">
        <label className="field"><span className="field-label">Measured width (mm)</span><input type="number" min="0.1" step="0.1" aria-label="Measured calibration width" data-testid="calibration-width" value={width} onChange={(event) => setWidth(event.target.value)} /></label>
        <label className="field"><span className="field-label">Measured height (mm) · optional</span><input type="number" min="0.1" step="0.1" aria-label="Measured calibration height" data-testid="calibration-height" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
        <label className="field"><span className="field-label">Move right (mm)</span><input type="number" step="0.1" aria-label="Calibration X offset" value={offsetX} onChange={(event) => setOffsetX(event.target.value)} /></label>
        <label className="field"><span className="field-label">Move down (mm)</span><input type="number" step="0.1" aria-label="Calibration Y offset" value={offsetY} onChange={(event) => setOffsetY(event.target.value)} /></label>
      </div>
      {inputError && <p className="field-hint" role="alert">{inputError}</p>}
      {candidate && <p className="field-hint" data-testid="calibration-result">Correction: X {(candidate.scaleX * 100).toFixed(2)}%, Y {(candidate.scaleY * 100).toFixed(2)}%; position {candidate.offsetXmm} mm right, {candidate.offsetYmm} mm down.</p>}
      <button className="btn primary" type="button" data-testid="calibration-apply" disabled={!candidate} onClick={apply}>Apply correction</button>
    </>}
    {current && <div className="calibration-current" data-testid="calibration-current">
      Active: X {(Number(current.scaleX ?? 1) * 100).toFixed(2)}%, Y {(Number(current.scaleY ?? 1) * 100).toFixed(2)}%, right {current.offsetXmm ?? 0} mm, down {current.offsetYmm ?? 0} mm.
      <button className="link" type="button" onClick={() => setDoc({ ...doc, print: { ...doc.print, calibration: undefined } })}>Clear correction</button>
    </div>}
  </details>;
}
