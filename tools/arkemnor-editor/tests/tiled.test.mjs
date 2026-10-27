import test from "node:test";
import assert from "node:assert/strict";
import {
  createMap, createLayer, addTileset, nextFirstGid,
  getTilesetForGid, gidBase, gidFlags, resizeMap, floodFill,
  importMap, serializeMap, safeName
} from "../src/tiled.mjs";
import { crc32, buildZip } from "../src/zip.mjs";

test("crea mapas Tiled ortogonales con capas de tiles y entidades", () => {
  const map = createMap(20, 12, 32, 32);
  assert.equal(map.layers.length, 3);
  assert.equal(map.layers[0].data.length, 240);
  assert.equal(map.layers[2].type, "objectgroup");
  assert.deepEqual(map.layers[2].objects, []);
});
test("mantiene nombres de imagen seguros", () => {
  assert.equal(safeName("../textures/grass tiles.png"), "grass_tiles.png");
  assert.equal(safeName("C:\\assets\\forest.png"), "forest.png");
});
test("dos tilesets obtienen rangos GID independientes", () => {
  const m = createMap();
  const a = addTileset(m, { name: "A", image: "a.png", imagewidth: 64, imageheight: 64 });
  const b = addTileset(m, { name: "B", image: "b.png", imagewidth: 128, imageheight: 64 });
  assert.equal(a.firstgid, 1);
  assert.equal(b.firstgid, 5);
  assert.equal(nextFirstGid(m.tilesets), 13);
  assert.equal(getTilesetForGid(m.tilesets, 7)?.name, "B");
  assert.equal(getTilesetForGid(m.tilesets, 44), null);
});
test("GID permite flags de volteo de Tiled sin perder el identificador base", () => {
  const gid = (0x80000000 | 23) >>> 0;
  assert.equal(gidBase(gid), 23);
  assert.ok(gidFlags(gid) !== 0);
});
test("relleno por vecinos no invade otras superficies", () => {
  const layer = createLayer("Ground", 1, 4, 3);
  layer.data = [1,1,2,2, 1,1,2,2, 1,1,2,2];
  assert.equal(floodFill(layer, 4, 3, 0, 0, 4), 6);
  assert.deepEqual(layer.data, [4,4,2,2, 4,4,2,2, 4,4,2,2]);
  assert.equal(floodFill(layer, 4, 3, 0, 0, 4), 0);
});
test("resize conserva el origen superior izquierdo y su contenido", () => {
  const m = createMap(3, 2);
  m.layers[0].data = [1,2,3,4,5,6];
  resizeMap(m, 2, 3);
  assert.deepEqual(m.layers[0].data, [1,2,4,5,0,0]);
});
test("exportar e importar conserva capas, objetos, GID y propiedades", () => {
  const m = createMap(4, 4, 32, 32);
  addTileset(m, { name:"Grass", image:"grass.png", imagewidth:128, imageheight:128 });
  m.layers[0].data[2] = (0x40000000 | 4) >>> 0;
  m.layers[2].objects.push({ id:1, name:"NPC Guard", class:"NPC", point:true, x:48, y:48, width:0, height:0 });
  m.properties = [{ name:"arkemnor:mapName", type:"string", value:"Valdren" }];
  const restored = importMap(serializeMap(m, "textures/"));
  assert.equal(restored.tilesets[0].image, "textures/grass.png");
  assert.equal(restored.layers[0].data[2], m.layers[0].data[2]);
  assert.equal(restored.layers[2].objects[0].name, "NPC Guard");
  assert.deepEqual(restored.properties, m.properties);
});
test("importador rechaza formatos que podrían provocar pérdidas silenciosas", () => {
  const m = createMap();
  m.orientation = "isometric";
  assert.throws(() => importMap(m), /ortogonales/);
  m.orientation = "orthogonal"; m.infinite = true;
  assert.throws(() => importMap(m), /ortogonales/);
  m.infinite = false; m.layers[0].data = "abc";
  assert.throws(() => importMap(m), /GID/);
});
test("importador rechaza tilesets externos TSJ de forma explícita", () => {
  const m = createMap();
  m.tilesets.push({ firstgid:1, source:"terrain.tsj" });
  assert.throws(() => importMap(m), /sin .tsj externos/);
});
test("CRC32 produce el valor estándar", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});
test("ZIP contiene cabeceras locales y directorio central", async () => {
  const blob = await buildZip([{ name: "test.tmj", data: "{\"type\":\"map\"}" }, { name: "textures/grass.png", data: new Uint8Array([137,80,78,71]) }]);
  const data = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(data.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(data.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(data.length - 22 + 10, true), 2);
});
