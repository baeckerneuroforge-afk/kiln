#!/usr/bin/env node

/**
 * Generiert PWA-Icon-PNGs als Platzhalter.
 * Orange-Ember-Gradient-Hintergrund mit weißem "K" in der Mitte.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { writeFileSync, copyFileSync, existsSync } from "fs";
import { deflateSync } from "zlib";

function createMinimalPNG(size) {
  const r = 0xF9, g = 0x73, b = 0x16;

  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type: RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = createChunk("IHDR", ihdrData);

  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(rowSize * size);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;

    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 3;
      const t = y / size;
      rawData[px] = Math.round(r * (1 - t) + 0xDC * t);
      rawData[px + 1] = Math.round(g * (1 - t) + 0x26 * t);
      rawData[px + 2] = Math.round(b * (1 - t) + 0x26 * t);

      // Draw white "K" in center
      const cx = x / size;
      const cy = y / size;
      if (cy >= 0.25 && cy <= 0.75) {
        const inK =
          (cx >= 0.30 && cx <= 0.40) ||
          (cy >= 0.25 && cy <= 0.50 && cx >= 0.40 && cx <= 0.70 && Math.abs(cx - 0.40 - (0.50 - cy) * 0.6) < 0.08) ||
          (cy >= 0.50 && cy <= 0.75 && cx >= 0.40 && cx <= 0.70 && Math.abs(cx - 0.40 - (cy - 0.50) * 0.6) < 0.08);

        if (inK) {
          rawData[px] = 0xFF;
          rawData[px + 1] = 0xFF;
          rawData[px + 2] = 0xFF;
        }
      }
    }
  }

  const compressed = deflateSync(rawData);
  const idat = createChunk("IDAT", compressed);
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const png = createMinimalPNG(size);
  const path = `public/icons/icon-${size}x${size}.png`;
  writeFileSync(path, png);
  console.log(`Created ${path} (${png.length} bytes)`);
}

// Create badge/icon files referenced in sw.js
if (existsSync("public/icons/icon-72x72.png")) {
  copyFileSync("public/icons/icon-72x72.png", "public/badge-72.png");
  console.log("Created public/badge-72.png");
}
if (existsSync("public/icons/icon-192x192.png")) {
  copyFileSync("public/icons/icon-192x192.png", "public/icon-192.png");
  console.log("Created public/icon-192.png");
}

// Placeholder screenshots
const tinyPng = createMinimalPNG(2);
writeFileSync("public/screenshots/dashboard.png", tinyPng);
writeFileSync("public/screenshots/mobile.png", tinyPng);
console.log("Created placeholder screenshots");

console.log("Done! Replace with real assets for production.");
