import QRCode from "qrcode";
import bwipjs from "bwip-js";

/** QR codes and barcodes are generated server-side to PNG data URLs so the
 * HTML output is self-contained (no client-side JS needed to see them, and
 * the same bytes work when the HTML is later rasterized for PDF). */
export async function qrCodeDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, { margin: 1, scale: 4 });
}

const BWIP_SYMBOLOGY: Record<string, string> = {
  code128: "code128",
  code39: "code39",
  ean13: "ean13",
  upc: "upca",
};

export async function barcodeDataUrl(value: string, symbology: string): Promise<string> {
  const bcid = BWIP_SYMBOLOGY[symbology] ?? "code128";
  const png = await bwipjs.toBuffer({
    bcid,
    text: value,
    scale: 2,
    height: 10,
    includetext: false,
  });
  return `data:image/png;base64,${png.toString("base64")}`;
}
