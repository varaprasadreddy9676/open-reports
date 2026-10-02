/** Read the printable text from the renderer's ESC/POS byte stream for an on-screen roll preview. */
export function decodeEscPos(bytes: Uint8Array): { text: string; lines: number; cuts: number } {
  const decoder = new TextDecoder("windows-1252");
  const rows: string[] = [];
  const printable: number[] = [];
  let current = "";
  let cuts = 0;
  const flush = () => {
    if (printable.length) {
      current += decoder.decode(Uint8Array.from(printable));
      printable.length = 0;
    }
  };
  const line = () => {
    flush();
    rows.push(current);
    current = "";
  };

  for (let i = 0; i < bytes.length;) {
    const byte = bytes[i++]!;
    if (byte === 0x0a) { line(); continue; }
    if (byte === 0x1b) {
      flush();
      const command = bytes[i++];
      if (command === 0x74 || command === 0x61 || command === 0x45) i += 1;
      continue;
    }
    if (byte === 0x1d) {
      flush();
      const command = bytes[i++];
      if ([0x21, 0x68, 0x77, 0x48].includes(command ?? -1)) i += 1;
      else if (command === 0x28) {
        const family = bytes[i++];
        const length = (bytes[i++] ?? 0) | ((bytes[i++] ?? 0) << 8);
        const payload = bytes.subarray(i, Math.min(bytes.length, i + length));
        if (family === 0x6b && payload[0] === 0x31 && payload[1] === 0x51) current += "[QR code]";
        i += length;
      } else if (command === 0x6b) {
        const mode = bytes[i++];
        if (mode === 0x49) {
          const length = bytes[i++] ?? 0;
          const data = decoder.decode(bytes.subarray(i, Math.min(bytes.length, i + length))).replace(/^\{B/, "");
          current += `[Barcode: ${data}]`;
          i += length;
        }
      } else if (command === 0x56) {
        i += 2; // partial cut mode and feed amount
        cuts += 1;
      }
      continue;
    }
    if (byte >= 0x20) printable.push(byte);
  }
  flush();
  if (current) rows.push(current);
  return { text: rows.join("\n"), lines: rows.length, cuts };
}
