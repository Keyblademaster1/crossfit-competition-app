import { test } from "node:test";
import assert from "node:assert/strict";
import { imageType, readColour } from "./club-look.ts";

test("colours are six-digit hex, lower-cased", () => {
  assert.equal(readColour("#3F512C"), "#3f512c");
  assert.equal(readColour(" #abcdef "), "#abcdef");
  assert.equal(readColour("#abc"), null);
  assert.equal(readColour("red"), null);
  assert.equal(readColour("#3f512c; background:url(x)"), null);
});

test("logos are judged by their first bytes", () => {
  assert.equal(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  assert.equal(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  assert.equal(imageType(webp), "image/webp");
  assert.equal(imageType(new TextEncoder().encode("<svg xmlns=")), null);
  assert.equal(imageType(new Uint8Array([])), null);
});
