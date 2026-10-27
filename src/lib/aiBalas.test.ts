import assert from "node:assert/strict";
import test from "node:test";
import { jsonIsi, rakitBalas, rakitSse } from "./aiBalas.ts";
import { rapiTautan } from "./tautan.ts";

const sse = [
  'data: {"choices":[{"delta":{"content":"ha"}}]}',
  'data: {"choices":[{"delta":{"content":"i"}}]}',
  "data: [DONE]",
].join("\n");

test("rakitBalas: JSON plus ekor [DONE] tetap terbaca", () => {
  const mentah = '{"choices":[{"message":{"content":"siap"}}]}data: [DONE]';
  assert.equal(rakitBalas(mentah, "text/event-stream"), "siap");
  assert.equal(rakitBalas(mentah, "application/json"), "siap");
  assert.equal(rakitBalas(sse, "text/event-stream"), "hai");
  assert.equal(rakitBalas('{"choices":[{"message":{"content":""}}]}'), "");
  assert.equal(jsonIsi("bukan json"), "");
  assert.equal(rakitSse("data: rusak{"), "");
});

test("rapiTautan: buang skema & garis miring ujung", () => {
  assert.equal(rapiTautan("https://github.com/namakun/kasirku"), "github.com/namakun/kasirku");
  assert.equal(rapiTautan("http://github.com/namakun/kasirku/"), "github.com/namakun/kasirku");
  assert.equal(rapiTautan("namakun@mail.com"), "namakun@mail.com");
  assert.equal(rapiTautan(undefined), "");
});
