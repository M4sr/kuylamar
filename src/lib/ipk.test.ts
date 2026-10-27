import assert from "node:assert/strict";
import { test } from "node:test";
import { angkaIpk, labelIpk } from "./ipk.ts";

test("IPK: sisakan angkanya saja", () => {
  assert.equal(angkaIpk("IPK 3,45"), "3,45");
  assert.equal(angkaIpk("ipk: 3.78"), "3.78");
  assert.equal(angkaIpk(" 3,78 "), "3,78");
  assert.equal(angkaIpk(""), "");
  assert.equal(angkaIpk(undefined), "");
});

test("IPK: label siap tempel di CV", () => {
  assert.equal(labelIpk("IPK 3,45"), " — IPK 3,45");
  assert.equal(labelIpk("3,78"), " — IPK 3,78");
  assert.equal(labelIpk(""), "");
  assert.equal(labelIpk(undefined), "");
});
