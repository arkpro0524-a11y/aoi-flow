//lib/image/dataUrl.ts
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const m = String(dataUrl || "").match(/^data:image\/\w+;base64,(.+)$/);
  if (!m) throw new Error("invalid dataUrl");

  const b64 = m[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }

  return bytes;
}