/** Tiled finite orthogonal JSON data model; no DOM dependencies. */
export const MAX_DIMENSION = 256;
export const GID_FLAGS = 0xf0000000;
export const GID_MASK = 0x0fffffff;
const positiveInt = (v, fallback, min = 1, max = MAX_DIMENSION) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
export const clampInt = positiveInt;
export const safeName = (name) => String(name || "asset.png").split(/[\\/]/).pop().replace(/[^\w.\-]/g, "_") || "asset.png";
export const gidBase = (gid) => (gid >>> 0) & GID_MASK;
export const gidFlags = (gid) => (gid >>> 0) & GID_FLAGS;
export function createLayer(name, id, width, height, type = "tilelayer") {
  if (type === "objectgroup") {
    return { id, name, type, draworder: "topdown", opacity: 1, visible: true, locked: false, x: 0, y: 0, objects: [] };
  }
  return { id, name, type: "tilelayer", opacity: 1, visible: true, locked: false, x: 0, y: 0, width, height, data: Array(width * height).fill(0) };
}
export function createMap(width = 32, height = 22, tilewidth = 32, tileheight = 32) {
  width = positiveInt(width, 32);
  height = positiveInt(height, 22);
  tilewidth = positiveInt(tilewidth, 32, 8, 128);
  tileheight = positiveInt(tileheight, 32, 8, 128);
  return {
    type: "map", version: "1.10", tiledversion: "1.11.2", orientation: "orthogonal",
    renderorder: "right-down", compressionlevel: -1, infinite: false,
    width, height, tilewidth, tileheight, nextlayerid: 4, nextobjectid: 1,
    layers: [createLayer("Ground", 1, width, height), createLayer("Details", 2, width, height), createLayer("Entities", 3, width, height, "objectgroup")],
    tilesets: []
  };
}
export function assertSupportedMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("El archivo no contiene un mapa Tiled válido.");
  if (value.orientation !== "orthogonal" || value.infinite) throw new Error("Esta versión admite mapas ortogonales de tamaño fijo (no isométricos ni infinitos).");
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > MAX_DIMENSION || value.height > MAX_DIMENSION) throw new Error("El mapa debe tener entre 1 y 256 celdas por lado.");
  if (!Number.isInteger(value.tilewidth) || !Number.isInteger(value.tileheight) || value.tilewidth < 8 || value.tileheight < 8 || value.tilewidth > 128 || value.tileheight > 128) throw new Error("Tamaño de celda no compatible (8–128 px).");
  if (!Array.isArray(value.layers) || !Array.isArray(value.tilesets)) throw new Error("El mapa Tiled no incluye capas o tilesets válidos.");
  for (const layer of value.layers) {
    if (!["tilelayer", "objectgroup"].includes(layer.type)) throw new Error(`La capa "${layer.name}" usa "${layer.type}", aún no soportado.`);
    if (layer.type === "tilelayer" && (!Array.isArray(layer.data) || layer.data.length !== value.width * value.height || layer.data.some(v => !Number.isInteger(v) || v < 0 || v > 0xffffffff))) {
      throw new Error(`La capa "${layer.name}" debe contener GID numéricos sin comprimir, con las dimensiones del mapa.`);
    }
    if (layer.type === "objectgroup" && !Array.isArray(layer.objects)) throw new Error("Capa de objetos inválida.");
  }
  for (const ts of value.tilesets) {
    if (ts.source || !ts.image) throw new Error("Por ahora importa tilesets de imagen incrustados en el TMJ (sin .tsj externos).");
    if (!Number.isInteger(ts.firstgid) || ts.firstgid < 1 || !Number.isInteger(ts.columns) || ts.columns < 1 || !Number.isInteger(ts.tilecount) || ts.tilecount < 1 || !Number.isInteger(ts.tilewidth) || !Number.isInteger(ts.tileheight)) throw new Error("Un tileset tiene metadatos incompletos.");
  }
  return value;
}
export function importMap(raw) {
  const input = typeof raw === "string" ? JSON.parse(raw) : raw;
  assertSupportedMap(input);
  const map = structuredClone(input);
  map.layers.forEach(layer => { layer.visible ??= true; layer.locked ??= false; layer.opacity ??= 1; });
  map.nextlayerid = Math.max(Number(map.nextlayerid) || 1, ...map.layers.map(l => (l.id || 0) + 1));
  map.nextobjectid = Math.max(Number(map.nextobjectid) || 1, ...map.layers.flatMap(l => l.objects || []).map(o => (o.id || 0) + 1));
  return map;
}
export function getTilesetForGid(tilesets, gid) {
  const base = gidBase(gid);
  if (!base) return null;
  return [...tilesets].sort((a, b) => b.firstgid - a.firstgid)
    .find(ts => base >= ts.firstgid && base < ts.firstgid + ts.tilecount) || null;
}
export function nextFirstGid(tilesets) {
  return tilesets.reduce((next, ts) => Math.max(next, ts.firstgid + ts.tilecount), 1);
}
export function addTileset(map, { name, image, imagewidth, imageheight, tilewidth = map.tilewidth, tileheight = map.tileheight, margin = 0, spacing = 0 }) {
  const columns = Math.floor((imagewidth - 2 * margin + spacing) / (tilewidth + spacing));
  const rows = Math.floor((imageheight - 2 * margin + spacing) / (tileheight + spacing));
  if (columns < 1 || rows < 1) throw new Error("La imagen no contiene ningún tile con el tamaño seleccionado.");
  const ts = { firstgid: nextFirstGid(map.tilesets), name, image: safeName(image),
    imagewidth, imageheight, tilewidth, tileheight, margin, spacing,
    columns, tilecount: columns * rows };
  map.tilesets.push(ts);
  return ts;
}
export function resizeMap(map, newWidth, newHeight) {
  const width = positiveInt(newWidth, map.width);
  const height = positiveInt(newHeight, map.height);
  for (const layer of map.layers) {
    if (layer.type !== "tilelayer") continue;
    const next = Array(width * height).fill(0);
    for (let y = 0; y < Math.min(height, map.height); y++)
      for (let x = 0; x < Math.min(width, map.width); x++)
        next[y * width + x] = layer.data[y * map.width + x] >>> 0;
    layer.data = next;
    layer.width = width;
    layer.height = height;
  }
  map.width = width;
  map.height = height;
}
export function floodFill(layer, width, height, startX, startY, gid) {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height || layer.type !== "tilelayer") return 0;
  const start = startY * width + startX, from = layer.data[start], to = gid >>> 0;
  if (from === to) return 0;
  const queue = [start];
  layer.data[start] = to;
  let count = 0;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head], x = idx % width, y = Math.floor(idx / width);
    count++;
    for (const n of [x > 0 ? idx - 1 : -1, x + 1 < width ? idx + 1 : -1, y > 0 ? idx - width : -1, y + 1 < height ? idx + width : -1]) {
      if (n >= 0 && layer.data[n] === from) { layer.data[n] = to; queue.push(n); }
    }
  }
  return count;
}
export function serializeMap(map, prefix = "") {
  assertSupportedMap(map);
  const result = structuredClone(map);
  result.layers.forEach(l => {
    if (l.type === "tilelayer") l.data = l.data.map(v => v >>> 0);
  });
  result.tilesets.forEach(ts => { ts.image = prefix + safeName(ts.image); });
  return JSON.stringify(result, null, 2);
}
