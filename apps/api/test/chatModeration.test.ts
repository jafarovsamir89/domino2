import test from "node:test";
import assert from "node:assert/strict";

import { maskProfanity } from "../src/modules/social/chatModeration.js";

test("maskProfanity handles inflections, suffixes, separators and leetspeak", () => {
  for (const text of [
    "сукой",
    "суку",
    "пиздец",
    "ебать",
    "мудак",
    "fucking",
    "fucked",
    "bullshit",
    "siktir",
    "qancıq",
    "orospu",
    "f.u.c.k",
    "х.у.й",
    "s.u.k.a"
  ]) {
    const result = maskProfanity(text);
    assert.equal(result.masked, true, `expected masked for ${text}`);
    assert.match(result.text, /^\*+$/);
  }
});

test("maskProfanity leaves clean text alone and avoids false positives", () => {
  for (const text of [
    "hello such a good game",
    "I got it",
    "classic",
    "assassin",
    "Scunthorpe",
    "hello clean world"
  ]) {
    const result = maskProfanity(text);
    assert.equal(result.masked, false, `expected clean for ${text}`);
    assert.equal(result.text, text);
  }
});
