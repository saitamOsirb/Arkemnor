/** Dependency-free ZIP writer, STORE mode; works in modern browsers. */
const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}
export function crc32(input) {
  let c = 0xffffffff;
  for (const b of input) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function header(length) {
  const b = new Uint8Array(length);
  return { bytes: b, view: new DataView(b.buffer) };
}
export async function buildZip(files) {
  if (!files.length || files.length > 200) throw new Error("Cantidad de archivos ZIP no compatible.");
  const parts = [], directory = [];
  let offset = 0;
  for (const f of files) {
    const name = encoder.encode(String(f.name).replaceAll("\\", "/"));
    if (name.length > 65535 || !name.length || f.name.startsWith("/") || f.name.includes("..")) throw new Error("Ruta ZIP no válida.");
    const data = f.data instanceof Uint8Array ? f.data : f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : encoder.encode(String(f.data));
    if (data.length > 0xffffffff || offset + data.length > 0xffffffff) throw new Error("Archivo ZIP demasiado grande.");
    const crc = crc32(data);
    const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    parts.push(local.bytes, data);
    const central = header(46 + name.length);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, data.length, true);
    central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, offset, true);
    central.bytes.set(name, 46);
    directory.push(central.bytes);
    offset += local.bytes.length + data.length;
  }
  const dirSize = directory.reduce((n, p) => n + p.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, directory.length, true);
  end.view.setUint16(10, directory.length, true);
  end.view.setUint32(12, dirSize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.bytes], { type: "application/zip" });
}
