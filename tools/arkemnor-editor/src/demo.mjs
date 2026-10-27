import { addTileset, createMap } from "./tiled.mjs";
/** Original procedural tiles so the editor is usable without third-party artwork. */
export function makeDemo() {
  const size = 32, atlas = document.createElement("canvas");
  atlas.width = 128;
  atlas.height = 128;
  const ctx = atlas.getContext("2d", { alpha: true });
  const palettes = [
    ["#416d38", "#578449", "#789b57"], ["#906a44", "#b18a59", "#745438"],
    ["#69727c", "#87919b", "#4d5d69"], ["#2b628f", "#367ca4", "#65a3bd"],
    ["#8d785e", "#b49c76", "#715942"], ["#d0b57b", "#ebd39b", "#a89064"],
    ["#2b5843", "#41745c", "#568c62"], ["#5c4e45", "#756354", "#342e32"],
    ["#bfccd1", "#e3ecef", "#93a8af"], ["#b64e2b", "#ee9152", "#72332b"],
    ["#5c5e6c", "#727487", "#3b4357"], ["#896445", "#b38b5b", "#603f30"],
    ["#405e47", "#62866b", "#304733"], ["#73746a", "#a8a898", "#4f514b"],
    ["#9e7f42", "#c5a253", "#78612d"], ["#465477", "#697ba4", "#303c5c"]
  ];
  for (let id = 0; id < 16; id++) {
    const x = id % 4 * size, y = Math.floor(id / 4) * size, [base, light, dark] = palettes[id];
    ctx.fillStyle = base;
    ctx.fillRect(x, y, size, size);
    if (id === 4 || id === 10 || id === 11) {
      ctx.strokeStyle = dark; ctx.lineWidth = 2;
      for (let row = 0; row < 4; row++) {
        ctx.beginPath(); ctx.moveTo(x, y + row * 8); ctx.lineTo(x + size, y + row * 8); ctx.stroke();
        for (let col = 0; col < 3; col++) {
          const off = row % 2 ? 4 : 12;
          ctx.beginPath(); ctx.moveTo(x + col * 12 + off, y + row * 8); ctx.lineTo(x + col * 12 + off, y + (row + 1) * 8); ctx.stroke();
        }
      }
    }
    let seed = id * 173 + 57;
    for (let p = 0; p < 26; p++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const dx = seed % 32;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const dy = seed % 32;
      ctx.fillStyle = p % 3 ? light : dark;
      ctx.fillRect(x + dx, y + dy, p % 5 === 0 ? 4 : 2, 2);
    }
    if (id === 3) {
      ctx.strokeStyle = "#84c6d2";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * 13, y + 8); ctx.lineTo(x + i * 13 + 9, y + 8); ctx.stroke();
      }
    }
  }
  const map = createMap(32, 22, size, size);
  const blobPromise = new Promise(resolve => atlas.toBlob(resolve, "image/png"));
  const ts = addTileset(map, { name: "Arkemnor Demo Terrain", image: "arkemnor-demo-terrain.png", imagewidth: 128, imageheight: 128 });
  const ground = map.layers[0], detail = map.layers[1];
  ground.data.fill(ts.firstgid);
  for (let y = 2; y < map.height - 2; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const idx = y * map.width + x;
      if (Math.abs(y - (10 + Math.sin(x / 4) * 2)) < 1.3 || Math.abs(x - 19) < 1) ground.data[idx] = ts.firstgid + 4;
      else if ((x - 7) ** 2 + (y - 5) ** 2 < 15) ground.data[idx] = ts.firstgid + 3;
      else if ((x * 7 + y * 13) % 47 === 0) detail.data[idx] = ts.firstgid + 6;
    }
  }
  return { map, image: atlas, blobPromise, tileset: ts };
}
