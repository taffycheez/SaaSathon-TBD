import test from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../lib/json.js";

test("extractJson parses bare JSON objects", () => {
  const result = extractJson('{"hello":"world"}');
  assert.deepEqual(result, { hello: "world" });
});

test("extractJson parses JSON wrapped in prose", () => {
  const result = extractJson('Here is the result:\n{"desks":[{"x_percent":20}]}');
  assert.deepEqual(result, { desks: [{ x_percent: 20 }] });
});

test("extractJson throws when there is no JSON", () => {
  assert.throws(() => extractJson("not json at all"), /Could not find JSON/);
});
