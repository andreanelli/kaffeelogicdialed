import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseDecision(previous, current, lock) {
  const parse = (version) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
      throw new Error(
        `Release versions must use stable major.minor.patch: ${version}`,
      );
    }
    return version.split(".").map(BigInt);
  };
  const next = parse(current.version);
  if (
    lock.version !== current.version ||
    lock.packages?.[""]?.version !== current.version
  ) {
    throw new Error(
      "package.json and package-lock.json versions must match. Use npm version.",
    );
  }
  if (!previous) return false;
  const before = parse(previous.version);
  for (let i = 0; i < 3; i++) {
    if (next[i] > before[i]) return true;
    if (next[i] < before[i])
      throw new Error(
        "Package version decreased; release a new version instead.",
      );
  }
  return false;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const current = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const before = process.env.BEFORE_SHA;
  let previous = null;
  if (before && !/^0+$/.test(before)) {
    if (!/^[a-f0-9]{40}$/.test(before))
      throw new Error("Invalid previous commit SHA");
    previous = JSON.parse(
      execFileSync("git", ["show", `${before}:package.json`], {
        encoding: "utf8",
      }),
    );
  }
  const release = releaseDecision(previous, current, lock);
  console.log(
    `Version ${current.version}: ${release ? "release requested" : "no version increase"}`,
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `release=${release}\nversion=${current.version}\n`,
    );
  }
}
