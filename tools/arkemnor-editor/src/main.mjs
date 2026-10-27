import { createMap, importMap, addTileset, resizeMap, createLayer, getTilesetForGid, gidBase, gidFlags, floodFill, serializeMap, clampInt, safeName } from "./tiled.mjs";
import { buildZip } from "./zip.mjs";
import { makeDemo } from "./demo.mjs";

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = {
  map: createMap(), assets: new Map(), selectedGid: 1, selectedTileset: 0, layerId: 1,
  tool: "brush", grid: true, zoom: 1, panX: 48, panY: 34, hover: null,
  dragging: null, history: [], redo: [], view: "map", mapName: "Valdren - Demo",
  sprite: { image: null, filename: "", direction: "south", frame: 0, playing: false, lastTick: 0, raf: 0 }
};
const mapCanvas = $("map-canvas"), viewport = $("map-viewport");
const ctx = mapCanvas.getContext("2d", { alpha: true });
const palCanvas = $("palette"), palCtx = palCanvas.getContext("2d", { alpha: true });
const spriteCanvas = $("sprite-preview"), spriteCtx = spriteCanvas.getContext("2d");
const sheetCanvas = $("sprite-sheet"), sheetCtx = sheetCanvas.getContext("2d");
const directions = ["south", "east", "north", "west"];

function report(message, error = false) {
  $("status").textContent = (error ? "Error: " : "") + message;
  $("status").style.color = error ? "#f9ac9a" : "#bed4d2";
}
function limitedNumber(value, fallback, min, max) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, Math.trunc(num))) : fallback;
}
function currentLayer() { return state.map.layers.find(l => l.id === state.layerId); }
function activeTileset() { return state.map.tilesets[state.selectedTileset] || null; }
function findAsset(image) { return state.assets.get(safeName(image)); }
function getMapName(map) {
  const property = (map.properties || []).find(x => x.name === "arkemnor:mapName");
  return property && typeof property.value === "string" ? property.value : "Mapa sin título";
}
function setMapName(value) {
  state.mapName = value.trim().slice(0, 70) || "Mapa sin título";
  state.map.properties ||= [];
  const prop = state.map.properties.find(p => p.name === "arkemnor:mapName");
  if (prop) prop.value = state.mapName;
  else state.map.properties.push({ name: "arkemnor:mapName", type: "string", value: state.mapName });
  $("map-badge").textContent = state.mapName;
}
function snapshot() {
  state.history.push(structuredClone(state.map));
  if (state.history.length > 35) state.history.shift();
  state.redo.length = 0;
  updateHistoryButtons();
}
function updateHistoryButtons() {
  $("undo").disabled = state.history.length === 0;
  $("redo").disabled = state.redo.length === 0;
}
function restoreMap(map) {
  state.map = map;
  if (!state.map.layers.some(x => x.id === state.layerId)) state.layerId = state.map.layers[0]?.id ?? 0;
  state.selectedTileset = Math.min(state.selectedTileset, state.map.tilesets.length - 1);
  state.mapName = getMapName(state.map);
  refreshAll();
}
function undo() {
  if (!state.history.length) return;
  state.redo.push(structuredClone(state.map));
  restoreMap(state.history.pop());
  updateHistoryButtons();
}
function redo() {
  if (!state.redo.length) return;
  state.history.push(structuredClone(state.map));
  restoreMap(state.redo.pop());
  updateHistoryButtons();
}
function refreshAll() {
  $("map-width").value = state.map.width;
  $("map-height").value = state.map.height;
  $("map-name").value = state.mapName;
  $("map-badge").textContent = state.mapName;
  refreshTilesets(); refreshLayers(); renderMap(); updateHistoryButtons(); updateAssetsStatus();
}
function updateAssetsStatus() {
  const missing = state.map.tilesets.filter(ts => !findAsset(ts.image)).map(ts => safeName(ts.image));
  $("assets-status").textContent = missing.length ? "Faltan imágenes: " + missing.join(", ") + ". Usa «Importar tileset PNG» para vincularlas." : `${state.map.tilesets.length} tileset(s) listos para exportar.`;
}
function refreshTilesets() {
  const select = $("tileset-select");
  select.replaceChildren();
  state.map.tilesets.forEach((ts, index) => {
    const o = document.createElement("option");
    o.value = String(index);
    o.textContent = ts.name + " · " + ts.tilecount + " tiles";
    select.append(o);
  });
  if (state.selectedTileset >= state.map.tilesets.length) state.selectedTileset = Math.max(0, state.map.tilesets.length - 1);
  select.value = String(state.selectedTileset);
  const ts = activeTileset();
  $("tile-meta").textContent = ts ? ts.tilewidth + "×" + ts.tileheight : "Sin tilesets";
  if (ts) {
    $("tileset-width").value = ts.tilewidth;
    $("tileset-height").value = ts.tileheight;
  }
  renderPalette();
}
function renderPalette() {
  const ts = activeTileset();
  const item = ts ? findAsset(ts.image) : null;
  palCanvas.width = item?.image.width || 220;
  palCanvas.height = item?.image.height || 115;
  palCtx.clearRect(0, 0, palCanvas.width, palCanvas.height);
  palCtx.imageSmoothingEnabled = false;
  palCanvas.style.width = Math.max(180, Math.round(palCanvas.width * Math.min(2, 320 / palCanvas.width))) + "px";
  if (!ts || !item) {
    palCtx.fillStyle = "#9cb1be"; palCtx.font = "13px sans-serif";
    palCtx.fillText(ts ? "Cargar PNG de este tileset" : "Importa un tileset PNG", 12, 44);
    $("tile-selection").textContent = "—";
    return;
  }
  palCtx.drawImage(item.image, 0, 0);
  const index = gidBase(state.selectedGid) - ts.firstgid;
  if (index >= 0 && index < ts.tilecount) {
    const sx = (index % ts.columns) * (ts.tilewidth + (ts.spacing || 0)) + (ts.margin || 0);
    const sy = Math.floor(index / ts.columns) * (ts.tileheight + (ts.spacing || 0)) + (ts.margin || 0);
    palCtx.strokeStyle = "#ffdb73"; palCtx.lineWidth = 2;
    palCtx.strokeRect(sx + 1, sy + 1, ts.tilewidth - 2, ts.tileheight - 2);
  }
  $("tile-selection").textContent = "GID " + (state.selectedGid >>> 0);
}
function selectGid(gid) {
  state.selectedGid = gid >>> 0;
  const ts = getTilesetForGid(state.map.tilesets, gid);
  if (ts) state.selectedTileset = state.map.tilesets.indexOf(ts);
  refreshTilesets();
}
function onPaletteSelect(event) {
  const ts = activeTileset(); if (!ts || !findAsset(ts.image)) return;
  const rect = palCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * palCanvas.width / rect.width;
  const y = (event.clientY - rect.top) * palCanvas.height / rect.height;
  const margin = ts.margin || 0, spacing = ts.spacing || 0;
  const cx = Math.floor((x - margin) / (ts.tilewidth + spacing));
  const cy = Math.floor((y - margin) / (ts.tileheight + spacing));
  const localX = (x - margin) % (ts.tilewidth + spacing);
  const localY = (y - margin) % (ts.tileheight + spacing);
  const index = cy * ts.columns + cx;
  if (cx < 0 || cy < 0 || cx >= ts.columns || localX < 0 || localY < 0 || localX >= ts.tilewidth || localY >= ts.tileheight || index >= ts.tilecount) return;
  selectGid(ts.firstgid + index);
  switchTool("brush");
  report("Tile seleccionado: GID " + state.selectedGid);
}
function refreshLayers() {
  const list = $("layer-list"); list.replaceChildren();
  [...state.map.layers].reverse().forEach(layer => {
    const row = document.createElement("div");
    row.className = "layer-item" + (layer.id === state.layerId ? " selected" : "");
    const eye = document.createElement("button"); eye.className = "eye";
    eye.textContent = layer.visible === false ? "○" : "◉";
    eye.title = "Mostrar/ocultar capa " + layer.name;
    eye.setAttribute("aria-label", eye.title);
    eye.addEventListener("click", () => { snapshot(); layer.visible = layer.visible === false; refreshLayers(); renderMap(); });
    const name = document.createElement("button"); name.className = "layer-name";
    name.textContent = layer.name; name.title = "Seleccionar; doble clic para renombrar";
    name.addEventListener("click", () => {
      state.layerId = layer.id;
      if (layer.type === "objectgroup") switchTool("object");
      refreshLayers();
    });
    name.addEventListener("dblclick", () => {
      const v = prompt("Nombre de la capa:", layer.name);
      if (v?.trim()) { snapshot(); layer.name = v.trim().slice(0, 70); refreshLayers(); }
    });
    const type = document.createElement("span"); type.className = "layer-type";
    type.textContent = layer.type === "objectgroup" ? "OBJ" : "TILE";
    row.append(eye, name, type);
    if (layer.locked) {
      const lock = document.createElement("span"); lock.textContent = "🔒"; row.append(lock);
    }
    list.append(row);
  });
}
function switchTool(tool) {
  state.tool = tool;
  $$(".tool").forEach(b => {
    const active = b.dataset.tool === tool;
    b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active));
  });
  viewport.style.cursor = tool === "pan" ? "grab" : tool === "pick" ? "copy" : "crosshair";
  renderMap();
}
function cssCanvasSize() {
  const r = viewport.getBoundingClientRect();
  return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
}
function setupCanvasSize(canvas, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.ceil(width * dpr), h = Math.ceil(height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}
function drawTile(gid, x, y, tw, th) {
  const ts = getTilesetForGid(state.map.tilesets, gid);
  if (!ts) return;
  const asset = findAsset(ts.image);
  if (!asset) {
    ctx.fillStyle = "#8f354b"; ctx.fillRect(x + 2, y + 2, tw - 4, th - 4);
    return;
  }
  const index = gidBase(gid) - ts.firstgid;
  const sx = (index % ts.columns) * (ts.tilewidth + (ts.spacing || 0)) + (ts.margin || 0);
  const sy = Math.floor(index / ts.columns) * (ts.tileheight + (ts.spacing || 0)) + (ts.margin || 0);
  const bits = gidFlags(gid);
  const w = ts.tilewidth, h = ts.tileheight, destX = x, destY = y + th - h;
  if (!bits) {
    ctx.drawImage(asset.image, sx, sy, w, h, destX, destY, w, h);
    return;
  }
  const flipH = !!(bits & 0x80000000), flipV = !!(bits & 0x40000000), diagonal = !!(bits & 0x20000000);
  ctx.save();
  ctx.translate(destX + w / 2, destY + h / 2);
  if (diagonal) ctx.transform(0, 1, 1, 0, 0, 0);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(asset.image, sx, sy, w, h, -w / 2, -h / 2, w, h);
  ctx.restore();
}
function renderMap() {
  if (state.view !== "map") return;
  const { width: vw, height: vh } = cssCanvasSize();
  const dpr = setupCanvasSize(mapCanvas, vw, vh);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(state.panX, state.panY); ctx.scale(state.zoom, state.zoom);
  ctx.imageSmoothingEnabled = false;
  const m = state.map, tw = m.tilewidth, th = m.tileheight;
  const minX = Math.max(0, Math.floor(-state.panX / state.zoom / tw) - 1);
  const minY = Math.max(0, Math.floor(-state.panY / state.zoom / th) - 1);
  const maxX = Math.min(m.width, Math.ceil((vw - state.panX) / state.zoom / tw) + 1);
  const maxY = Math.min(m.height, Math.ceil((vh - state.panY) / state.zoom / th) + 1);
  ctx.fillStyle = "#253b36"; ctx.fillRect(0, 0, m.width * tw, m.height * th);
  for (const layer of m.layers) {
    if (layer.visible === false) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));
    if (layer.type === "tilelayer") {
      for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) {
          const gid = layer.data[y * m.width + x];
          if (gid) drawTile(gid, x * tw, y * th, tw, th);
        }
      }
    } else if (layer.type === "objectgroup") {
      ctx.lineWidth = 2 / state.zoom;
      for (const obj of layer.objects) {
        if (obj.visible === false) continue;
        const x = obj.x, y = obj.y;
        ctx.fillStyle = "#f0bf77"; ctx.strokeStyle = "#18252f";
        ctx.beginPath(); ctx.arc(x, y, 6 / state.zoom, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.font = `${Math.max(9, 12 / state.zoom)}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff"; ctx.shadowColor = "#000"; ctx.shadowBlur = 3 / state.zoom;
        ctx.fillText(obj.name || obj.class || "Entidad", x, y - 10 / state.zoom);
        ctx.shadowBlur = 0;
      }
    }
  }
  ctx.globalAlpha = 1;
  if (state.grid && state.zoom >= 0.45) {
    ctx.strokeStyle = "#d8e0cf33"; ctx.lineWidth = 1 / state.zoom;
    ctx.beginPath();
    for (let x = minX; x <= maxX; x++) { ctx.moveTo(x * tw, minY * th); ctx.lineTo(x * tw, maxY * th); }
    for (let y = minY; y <= maxY; y++) { ctx.moveTo(minX * tw, y * th); ctx.lineTo(maxX * tw, y * th); }
    ctx.stroke();
  }
  if (state.hover && state.hover.x >= 0 && state.hover.x < m.width && state.hover.y >= 0 && state.hover.y < m.height) {
    ctx.strokeStyle = "#ffe097"; ctx.lineWidth = 2 / state.zoom;
    ctx.strokeRect(state.hover.x * tw + 1 / state.zoom, state.hover.y * th + 1 / state.zoom, tw - 2 / state.zoom, th - 2 / state.zoom);
  }
  ctx.strokeStyle = "#d3b682"; ctx.lineWidth = 2 / state.zoom;
  ctx.strokeRect(0, 0, m.width * tw, m.height * th);
  ctx.restore();
  $("zoom-info").textContent = Math.round(state.zoom * 100) + "%";
}
function fitMap() {
  const { width, height } = cssCanvasSize();
  const m = state.map;
  state.zoom = Math.min(5, Math.max(0.25, Math.min((width - 80) / (m.width * m.tilewidth), (height - 80) / (m.height * m.tileheight))));
  state.panX = (width - m.width * m.tilewidth * state.zoom) / 2;
  state.panY = (height - m.height * m.tileheight * state.zoom) / 2;
  renderMap();
}
function zoomAt(factor, px, py) {
  const worldX = (px - state.panX) / state.zoom;
  const worldY = (py - state.panY) / state.zoom;
  state.zoom = Math.min(6, Math.max(0.25, state.zoom * factor));
  state.panX = px - worldX * state.zoom;
  state.panY = py - worldY * state.zoom;
  renderMap();
}
function pointFromEvent(e) {
  const r = viewport.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const wx = (px - state.panX) / state.zoom, wy = (py - state.panY) / state.zoom;
  return { px, py, wx, wy, x: Math.floor(wx / state.map.tilewidth), y: Math.floor(wy / state.map.tileheight) };
}
function inBounds(p) { return p.x >= 0 && p.y >= 0 && p.x < state.map.width && p.y < state.map.height; }
function paintCell(p) {
  if (!inBounds(p)) return;
  let layer = currentLayer();
  if (!layer || layer.locked) { report("La capa activa está bloqueada.", true); return; }
  const m = state.map;
  if (state.tool === "object") {
    if (layer.type !== "objectgroup") {
      layer = m.layers.find(l => l.type === "objectgroup");
      if (!layer) { report("Primero crea una capa de objetos.", true); return; }
      state.layerId = layer.id; refreshLayers();
    }
    layer.objects.push({
      id: m.nextobjectid++, name: $("object-name").value.trim() || $("object-type").value,
      class: $("object-type").value, x: (p.x + .5) * m.tilewidth, y: (p.y + .5) * m.tileheight,
      point: true, width: 0, height: 0, rotation: 0, visible: true
    });
    return;
  }
  if (layer.type === "objectgroup") {
    if (state.tool === "erase") {
      const index = layer.objects.findIndex(o => Math.hypot(o.x - p.wx, o.y - p.wy) <= Math.max(12, 16 / state.zoom));
      if (index >= 0) layer.objects.splice(index, 1);
    } else report("Selecciona una capa de tiles para pintar.", true);
    return;
  }
  const idx = p.y * m.width + p.x;
  if (state.tool === "brush") layer.data[idx] = state.selectedGid >>> 0;
  else if (state.tool === "erase") layer.data[idx] = 0;
  else if (state.tool === "fill") floodFill(layer, m.width, m.height, p.x, p.y, state.selectedGid);
  else if (state.tool === "pick") {
    const gid = layer.data[idx];
    if (gid) selectGid(gid);
    switchTool("brush");
  }
}
function strokeBetween(a, b) {
  let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  while (true) {
    paintCell({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function bindMapEvents() {
  viewport.addEventListener("contextmenu", e => e.preventDefault());
  viewport.addEventListener("pointerdown", e => {
    if (e.button !== 0 && e.button !== 1) return;
    viewport.focus(); viewport.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    const panning = state.tool === "pan" || e.button === 1 || e.shiftKey && state.tool !== "object";
    state.dragging = { panning, last: p, clientX: e.clientX, clientY: e.clientY };
    if (!panning) {
      if (state.tool !== "pick") snapshot();
      paintCell(p); renderMap();
    }
  });
  viewport.addEventListener("pointermove", e => {
    const p = pointFromEvent(e);
    state.hover = p;
    $("map-cursor").textContent = `X: ${p.x} · Y: ${p.y}`;
    const drag = state.dragging;
    if (drag) {
      if (drag.panning) {
        state.panX += e.clientX - drag.clientX; state.panY += e.clientY - drag.clientY;
      } else if (["brush", "erase"].includes(state.tool) && (drag.last.x !== p.x || drag.last.y !== p.y)) {
        strokeBetween(drag.last, p);
      }
      drag.last = p; drag.clientX = e.clientX; drag.clientY = e.clientY;
    }
    renderMap();
  });
  const stop = () => { state.dragging = null; };
  viewport.addEventListener("pointerup", stop);
  viewport.addEventListener("pointercancel", stop);
  viewport.addEventListener("lostpointercapture", stop);
  viewport.addEventListener("pointerleave", () => { if (!state.dragging) { state.hover = null; renderMap(); } });
  viewport.addEventListener("wheel", e => {
    e.preventDefault(); const p = pointFromEvent(e);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.px, p.py);
  }, { passive: false });
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportName() {
  return safeName(state.mapName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "") + ".tmj");
}
async function exportZip() {
  try {
    const files = [{ name: exportName(), data: serializeMap(state.map, "textures/") }];
    for (const ts of state.map.tilesets) {
      const asset = findAsset(ts.image);
      if (!asset) throw new Error("Falta el PNG del tileset: " + ts.image);
      if (!files.some(f => f.name === "textures/" + safeName(ts.image))) files.push({ name: "textures/" + safeName(ts.image), data: asset.file });
    }
    const blob = await buildZip(files);
    download(blob, exportName().replace(/\.tmj$/i, ".zip"));
    report(`Proyecto Tiled ZIP exportado: ${files.length} archivos. Descomprímelo para abrir el TMJ en Tiled.`);
  } catch (e) { report(e.message, true); }
}
function exportTmj() {
  try {
    download(new Blob([serializeMap(state.map)], { type: "application/json" }), exportName());
    report("TMJ descargado. Sus imágenes deben estar en la misma carpeta que el mapa; el ZIP conserva las rutas automáticamente.");
  } catch (e) { report(e.message, true); }
}
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo abrir " + file.name)); };
    image.src = url;
  });
}
async function readPngFile(file, createTileset = true) {
  if (!/\.png$/i.test(file.name)) throw new Error("El archivo debe ser PNG.");
  const key = safeName(file.name);
  const image = await loadImage(file);
  if (!createTileset && !state.map.tilesets.some(ts => safeName(ts.image) === key)) return;
  if (createTileset && state.map.tilesets.some(ts => safeName(ts.image) === key) && state.assets.has(key)) throw new Error("Ya existe un tileset con este nombre: " + key);
  if (createTileset && !state.map.tilesets.some(ts => safeName(ts.image) === key)) {
    const w = limitedNumber($("tileset-width").value, state.map.tilewidth, 8, 128);
    const h = limitedNumber($("tileset-height").value, state.map.tileheight, 8, 128);
    const ts = addTileset(state.map, { name: key.replace(/\.png$/i, ""), image: key, imagewidth: image.width, imageheight: image.height, tilewidth: w, tileheight: h });
    state.selectedTileset = state.map.tilesets.indexOf(ts);
    state.selectedGid = ts.firstgid;
  }
  state.assets.set(key, { image, file });
}
async function importFiles(input) {
  const files = [...input.files];
  const mapFile = files.find(f => /\.(tmj|json)$/i.test(f.name));
  if (!mapFile) { report("Selecciona un archivo TMJ/JSON y los PNG que utiliza.", true); return; }
  try {
    const map = importMap(await mapFile.text());
    const loadedAssets = new Map();
    for (const file of files.filter(f => /\.png$/i.test(f.name))) {
      const image = await loadImage(file);
      const key = safeName(file.name);
      if (loadedAssets.has(key)) throw new Error("Hay dos PNG con el mismo nombre: " + key);
      loadedAssets.set(key, { image, file });
    }
    state.map = map;
    state.assets = loadedAssets;
    state.history = []; state.redo = [];
    state.layerId = map.layers.find(l => l.type === "tilelayer")?.id ?? map.layers[0]?.id;
    state.selectedTileset = 0;
    state.selectedGid = map.tilesets[0]?.firstgid || 0;
    state.mapName = getMapName(map);
    refreshAll(); fitMap();
    report("Mapa importado. " + (map.tilesets.filter(ts => !findAsset(ts.image)).length ? "Algunos PNG no se adjuntaron; impórtalos desde la biblioteca." : "Todos los tilesets están vinculados."));
  } catch (e) { report("No se pudo importar: " + e.message, true); }
  input.value = "";
}
async function addPngFiles(input) {
  const files = [...input.files]; if (!files.length) return;
  try {
    snapshot();
    for (const f of files) await readPngFile(f);
    refreshAll();
    report(files.length + " imagen(es) incorporadas. Selecciona un tile de la paleta.");
  } catch (e) { report(e.message, true); }
  input.value = "";
}
function addLayer() {
  snapshot();
  const layer = createLayer("Layer " + state.map.nextlayerid, state.map.nextlayerid++, state.map.width, state.map.height);
  const obj = state.map.layers.findIndex(l => l.type === "objectgroup");
  state.map.layers.splice(obj < 0 ? state.map.layers.length : obj, 0, layer);
  state.layerId = layer.id; refreshLayers(); switchTool("brush");
}
function reorderLayer(direction) {
  const idx = state.map.layers.findIndex(l => l.id === state.layerId), dest = idx + direction;
  if (idx < 0 || dest < 0 || dest >= state.map.layers.length) return;
  snapshot();
  [state.map.layers[idx], state.map.layers[dest]] = [state.map.layers[dest], state.map.layers[idx]];
  refreshLayers(); renderMap();
}
function deleteLayer() {
  const layer = currentLayer();
  if (!layer || state.map.layers.length <= 1) return;
  if (!confirm('¿Eliminar la capa "' + layer.name + '" y todo su contenido?')) return;
  snapshot();
  state.map.layers = state.map.layers.filter(l => l.id !== layer.id);
  state.layerId = state.map.layers.at(-1)?.id ?? 0;
  refreshLayers(); renderMap();
}
function bindEditorActions() {
  $$(".tab").forEach(button => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    $("map-view").hidden = state.view !== "map"; $("sprite-view").hidden = state.view !== "sprite";
    $$(".tab").forEach(b => { const active = b === button; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); });
    if (state.view === "map") { $("open-map").hidden = $("save-map").hidden = $("save-zip").hidden = false; renderMap(); }
    else { $("open-map").hidden = $("save-map").hidden = $("save-zip").hidden = true; drawSpritePreview(); drawSpriteSheet(); }
    if (state.view !== "sprite") pauseSprite();
  }));
  $$(".tool").forEach(b => b.addEventListener("click", () => switchTool(b.dataset.tool)));
  $("tileset-select").addEventListener("change", e => {
    state.selectedTileset = Number(e.target.value);
    const ts = activeTileset(); if (ts) state.selectedGid = ts.firstgid;
    refreshTilesets();
  });
  palCanvas.addEventListener("click", onPaletteSelect);
  palCanvas.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectGid(activeTileset()?.firstgid || 0); } });
  $("add-tileset").addEventListener("click", () => $("tileset-file").click());
  $("tileset-file").addEventListener("change", e => addPngFiles(e.target));
  $("open-map").addEventListener("click", () => $("map-file").click());
  $("map-file").addEventListener("change", e => importFiles(e.target));
  $("save-map").addEventListener("click", exportTmj);
  $("save-zip").addEventListener("click", exportZip);
  $("map-name").addEventListener("change", e => { snapshot(); setMapName(e.target.value); });
  $("resize-map").addEventListener("click", () => {
    const w = limitedNumber($("map-width").value, state.map.width, 1, 256);
    const h = limitedNumber($("map-height").value, state.map.height, 1, 256);
    if (w === state.map.width && h === state.map.height) return;
    if (w < state.map.width || h < state.map.height) if (!confirm("Reducir el mapa recortará los tiles y objetos situados fuera de sus nuevos límites. ¿Continuar?")) return;
    snapshot(); resizeMap(state.map, w, h);
    state.map.layers.filter(l => l.type === "objectgroup").forEach(l => { l.objects = l.objects.filter(o => o.x >= 0 && o.y >= 0 && o.x <= w * state.map.tilewidth && o.y <= h * state.map.tileheight); });
    refreshAll(); fitMap(); report("Dimensiones actualizadas.");
  });
  $("add-layer").addEventListener("click", addLayer);
  $("layer-up").addEventListener("click", () => reorderLayer(1));
  $("layer-down").addEventListener("click", () => reorderLayer(-1));
  $("layer-delete").addEventListener("click", deleteLayer);
  $("new-map").addEventListener("click", () => {
    if (!confirm("¿Crear mapa vacío? Exporta antes tu trabajo: los cambios actuales no guardados se perderán.")) return;
    state.map = createMap(limitedNumber($("map-width").value, 32, 1, 256), limitedNumber($("map-height").value, 22, 1, 256));
    state.assets.clear(); state.history = []; state.redo = [];
    state.layerId = 1; state.selectedGid = 0; state.selectedTileset = 0;
    setMapName("Nuevo mapa"); refreshAll(); fitMap(); report("Mapa vacío creado.");
  });
  $("undo").addEventListener("click", undo); $("redo").addEventListener("click", redo);
  $("toggle-grid").addEventListener("click", () => {
    state.grid = !state.grid; $("toggle-grid").classList.toggle("active", state.grid);
    $("toggle-grid").setAttribute("aria-pressed", String(state.grid)); renderMap();
  });
  $("fit-map").addEventListener("click", fitMap);
  $("zoom-in").addEventListener("click", () => { const r = cssCanvasSize(); zoomAt(1.25, r.width / 2, r.height / 2); });
  $("zoom-out").addEventListener("click", () => { const r = cssCanvasSize(); zoomAt(.8, r.width / 2, r.height / 2); });
  document.addEventListener("keydown", e => {
    if (state.view !== "map" || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "") || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === "y") { e.preventDefault(); redo(); }
      return;
    }
    const keys = { b: "brush", e: "erase", f: "fill", i: "pick", o: "object", h: "pan" };
    if (keys[k]) switchTool(keys[k]);
  });
  bindMapEvents();
}
function spriteSettings() {
  const s = state.sprite;
  return {
    w: limitedNumber($("sprite-width").value, 32, 1, 512),
    h: limitedNumber($("sprite-height").value, 32, 1, 512),
    frames: limitedNumber($("sprite-frames").value, 4, 1, 32),
    fps: limitedNumber($("sprite-fps").value, 6, 1, 30),
    offX: limitedNumber($("sprite-offset-x").value, 0, 0, 256),
    offY: limitedNumber($("sprite-offset-y").value, 0, 0, 256),
    rows: Object.fromEntries(directions.map(d => [d, limitedNumber($("row-" + d).value, 0, 0, 256)])),
    image: s.image
  };
}
function spriteRect(settings, dir = state.sprite.direction, frame = state.sprite.frame) {
  const sx = (settings.offX + frame) * settings.w;
  const sy = (settings.offY + settings.rows[dir]) * settings.h;
  return { sx, sy, valid: !!settings.image && sx + settings.w <= settings.image.width && sy + settings.h <= settings.image.height };
}
function drawSpritePreview() {
  const rect = spriteCanvas.getBoundingClientRect(), w = rect.width || 640, h = rect.height || 320;
  const dpr = setupCanvasSize(spriteCanvas, w, h);
  spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  spriteCtx.clearRect(0, 0, w, h);
  const settings = spriteSettings(), src = spriteRect(settings);
  if (!settings.image) {
    spriteCtx.fillStyle = "#a5b3ba"; spriteCtx.font = "14px system-ui"; spriteCtx.textAlign = "center";
    spriteCtx.fillText("Importa un spritesheet PNG para empezar", w / 2, h / 2);
    return;
  }
  if (!src.valid) {
    $("sprite-status").textContent = "La configuración supera los límites de la hoja. Revisa dimensiones, frames y filas.";
    spriteCtx.fillStyle = "#f4aa90"; spriteCtx.font = "13px system-ui"; spriteCtx.textAlign = "center";
    spriteCtx.fillText("Frame fuera de la imagen", w / 2, h / 2);
    return;
  }
  $("sprite-status").textContent = settings.image.width + " × " + settings.image.height + " px · " + state.sprite.direction.toUpperCase();
  const scale = Math.max(.3, Math.min(7, (w - 65) / settings.w, (h - 70) / settings.h));
  const dw = settings.w * scale, dh = settings.h * scale;
  spriteCtx.imageSmoothingEnabled = false;
  spriteCtx.fillStyle = "#556d6d33";
  spriteCtx.beginPath(); spriteCtx.ellipse(w / 2, h / 2 + dh / 2 - 3, Math.min(dw / 2, 90), 8, 0, 0, Math.PI * 2); spriteCtx.fill();
  spriteCtx.drawImage(settings.image, src.sx, src.sy, settings.w, settings.h, (w - dw) / 2, (h - dh) / 2, dw, dh);
  $("sprite-frame-info").textContent = `Frame ${state.sprite.frame + 1}/${settings.frames} · celda (${src.sx}, ${src.sy})`;
}
function drawSpriteSheet() {
  const settings = spriteSettings(), img = settings.image;
  sheetCanvas.width = img ? img.width : 300;
  sheetCanvas.height = img ? img.height : 150;
  sheetCanvas.style.width = img ? img.width * Math.min(2, 960 / img.width) + "px" : "300px";
  sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  sheetCtx.imageSmoothingEnabled = false;
  if (!img) {
    sheetCtx.fillStyle = "#a5b3ba"; sheetCtx.font = "13px system-ui";
    sheetCtx.fillText("Sin spritesheet", 16, 50); return;
  }
  sheetCtx.drawImage(img, 0, 0);
  sheetCtx.strokeStyle = "#fff7"; sheetCtx.lineWidth = 1;
  sheetCtx.beginPath();
  for (let x = 0; x <= img.width; x += settings.w) { sheetCtx.moveTo(x + .5, 0); sheetCtx.lineTo(x + .5, img.height); }
  for (let y = 0; y <= img.height; y += settings.h) { sheetCtx.moveTo(0, y + .5); sheetCtx.lineTo(img.width, y + .5); }
  sheetCtx.stroke();
  const src = spriteRect(settings);
  if (src.valid) {
    sheetCtx.lineWidth = 2; sheetCtx.strokeStyle = "#ffe18d";
    sheetCtx.strokeRect(src.sx + 1, src.sy + 1, settings.w - 2, settings.h - 2);
  }
}
function pauseSprite() {
  state.sprite.playing = false;
  cancelAnimationFrame(state.sprite.raf);
  $("sprite-play").textContent = "▶ Reproducir";
}
function spriteTick(now) {
  if (!state.sprite.playing || state.view !== "sprite") return;
  const s = spriteSettings();
  if (now - state.sprite.lastTick >= 1000 / s.fps) {
    state.sprite.frame = (state.sprite.frame + 1) % s.frames;
    state.sprite.lastTick = now;
    drawSpritePreview(); drawSpriteSheet();
  }
  state.sprite.raf = requestAnimationFrame(spriteTick);
}
function bindSpriteActions() {
  $("open-sprite").addEventListener("click", () => $("sprite-file").click());
  $("sprite-file").addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (!/\.png$/i.test(file.name)) throw new Error("Solo se admiten imágenes PNG.");
      state.sprite.image = await loadImage(file);
      state.sprite.filename = safeName(file.name);
      state.sprite.frame = 0;
      pauseSprite();
      $("sprite-file-name").textContent = file.name + " · " + state.sprite.image.width + "×" + state.sprite.image.height + " px";
      drawSpritePreview(); drawSpriteSheet(); report("Spritesheet importado: " + file.name);
    } catch (err) { report(err.message, true); }
    e.target.value = "";
  });
  const ids = ["sprite-width","sprite-height","sprite-frames","sprite-fps","sprite-offset-x","sprite-offset-y","row-south","row-east","row-north","row-west"];
  ids.forEach(id => $(id).addEventListener("input", () => {
    state.sprite.frame %= spriteSettings().frames;
    drawSpritePreview(); drawSpriteSheet();
  }));
  $$("[data-direction]").forEach(btn => btn.addEventListener("click", () => {
    state.sprite.direction = btn.dataset.direction; state.sprite.frame = 0;
    $$("[data-direction]").forEach(b => b.classList.toggle("active", b === btn));
    drawSpritePreview(); drawSpriteSheet();
  }));
  $("sprite-play").addEventListener("click", () => {
    if (!state.sprite.image) { report("Importa primero un spritesheet.", true); return; }
    if (state.sprite.playing) pauseSprite();
    else {
      state.sprite.playing = true; state.sprite.lastTick = 0;
      $("sprite-play").textContent = "❚❚ Pausar"; state.sprite.raf = requestAnimationFrame(spriteTick);
    }
  });
  $("sprite-step").addEventListener("click", () => {
    pauseSprite();
    state.sprite.frame = (state.sprite.frame + 1) % spriteSettings().frames;
    drawSpritePreview(); drawSpriteSheet();
  });
  sheetCanvas.addEventListener("click", e => {
    const img = state.sprite.image; if (!img) return;
    const r = sheetCanvas.getBoundingClientRect(), s = spriteSettings();
    const x = Math.floor((e.clientX - r.left) * img.width / r.width / s.w);
    const y = Math.floor((e.clientY - r.top) * img.height / r.height / s.h);
    const dir = directions.find(d => y === s.offY + s.rows[d]);
    if (dir && x >= s.offX && x < s.offX + s.frames) {
      state.sprite.direction = dir; state.sprite.frame = x - s.offX;
      $$("[data-direction]").forEach(b => b.classList.toggle("active", b.dataset.direction === dir));
      pauseSprite(); drawSpritePreview(); drawSpriteSheet();
    }
  });
  $("export-sprite").addEventListener("click", () => {
    if (!state.sprite.image) { report("Importa un spritesheet primero.", true); return; }
    const s = spriteSettings();
    const invalid = directions.some(d => !spriteRect(s, d, s.frames - 1).valid);
    if (invalid) { report("Hay direcciones/frames fuera del PNG; ajusta la configuración.", true); return; }
    const json = {
      format: "arkemnor-sprite-v1", image: state.sprite.filename,
      frame_width: s.w, frame_height: s.h, frames_per_direction: s.frames,
      fps: s.fps, start_column: s.offX, start_row: s.offY, direction_rows: s.rows
    };
    download(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), state.sprite.filename.replace(/\.png$/i, "") + ".sprite.json");
    report("Configuración de sprite exportada.");
  });
  new ResizeObserver(() => { if (state.view === "sprite") drawSpritePreview(); }).observe(document.querySelector(".sprite-display"));
}
async function boot() {
  bindEditorActions(); bindSpriteActions();
  new ResizeObserver(() => renderMap()).observe(viewport);
  const demo = makeDemo();
  state.map = demo.map;
  state.layerId = demo.map.layers[0].id;
  setMapName("Valdren - Demo");
  const blob = await demo.blobPromise;
  if (blob) state.assets.set(demo.tileset.image, { image: demo.image, file: blob });
  refreshAll(); fitMap();
  report("Editor listo. Mapa de prueba generado con tiles originales. Puedes pintar y exportar a Tiled.");
}
boot().catch(e => report("Error al iniciar: " + e.message, true));
