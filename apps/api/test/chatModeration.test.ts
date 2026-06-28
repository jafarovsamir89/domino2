import test from "node:test";
import assert from "node:assert/strict";

import { maskProfanity } from "../src/modules/social/chatModeration.js";

test("maskProfanity handles separators, repeats and leetspeak while leaving clean text alone", () => {
  const dirty = maskProfanity("с.у.к.а fuuuck sh1t hello world");
  assert.equal(dirty.masked, true);
  assert.equal(dirty.text, "******* ****** **** hello world");

  const clean = maskProfanity("hello clean world");
  assert.equal(clean.masked, false);
  assert.equal(clean.text, "hello clean world");
});
