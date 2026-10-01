import QRCode from "qrcode";
import bwipjs from "bwip-js";

export async function qrCodeBuffer(value: string): Promise<Buffer> {
  return QRCode.toBuffer(value, { margin: 1, scale: 4, type: "png" });
}

const BWIP_SYMBOLOGY: Record<string, string> = {
  code128: "code128",
  code39: "code39",
  ean13: "ean13",
  upc: "upca",
};

export async function barcodeBuffer(value: string, symbology: string): Promise<Buffer> {
  const bcid = BWIP_SYMBOLOGY[symbology] ?? "code128";
  return bwipjs.toBuffer({ bcid, text: value, scale: 2, height: 10, includetext: false });
}
