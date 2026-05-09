import test from "node:test";
import assert from "node:assert/strict";

import { extractJson } from "./json.js";

test("extractJson parses direct JSON objects", () => {
  assert.deepEqual(extractJson('{"ok":true,"count":2}'), {
    ok: true,
    count: 2
  });
});

test("extractJson extracts JSON from surrounding model text", () => {
  assert.deepEqual(extractJson('Here is the payload:\n[{"x_percent":25}]'), [
    { x_percent: 25 }
  ]);
});

test("extractJson throws a useful error when no JSON is present", () => {
  assert.throws(() => extractJson("No structured payload here."), /Could not find JSON/i);
});
