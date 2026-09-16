import test from "node:test";
import assert from "node:assert/strict";
import { releaseDecision } from "../scripts/release-version.js";

const decide = (before, after) =>
  releaseDecision(
    before ? { version: before } : null,
    { version: after },
    { version: after, packages: { "": { version: after } } },
  );

test("only a stable version increase requests deployment", () => {
  for (const next of ["0.1.1", "0.2.0", "1.0.0", "0.10.0"]) {
    assert.equal(decide("0.1.0", next), true);
  }
  assert.equal(decide("0.9.0", "0.10.0"), true);
  assert.equal(decide("0.1.0", "0.1.0"), false);
  assert.equal(decide(null, "0.1.0"), false);
  assert.throws(() => decide("0.2.0", "0.1.9"), /decreased/);
  for (const next of ["01.2.3", "1.2", "1.2.3-beta.1", "1.2.3+build"]) {
    assert.throws(() => decide("0.1.0", next), /stable/);
  }
});

test("both lockfile version fields must match the package", () => {
  for (const lock of [
    { version: "0.1.0", packages: { "": { version: "0.1.1" } } },
    { version: "0.1.1", packages: { "": { version: "0.1.0" } } },
    { version: "0.1.1" },
  ]) {
    assert.throws(
      () => releaseDecision({ version: "0.1.0" }, { version: "0.1.1" }, lock),
      /must match/,
    );
  }
});
