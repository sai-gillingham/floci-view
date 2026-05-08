#!/usr/bin/env bun
import pkg from "../package.json" with { type: "json" };

interface FlociField {
  version?: string;
}

const range = (pkg as { floci?: FlociField }).floci?.version;

const inGitHubActions = process.env.GITHUB_ACTIONS === "true";

const warn = (message: string) => {
  if (inGitHubActions) {
    console.log(`::warning title=Floci version::${message}`);
  } else {
    console.warn(`[33m⚠ floci-version: ${message}[0m`);
  }
};

const ok = (message: string) => {
  console.log(`floci-version: ${message}`);
};

if (process.env.SKIP_FLOCI_CHECK === "1") {
  process.exit(0);
}

if (!range) {
  process.exit(0);
}

const actual = process.env.FLOCI_VERSION;
if (!actual) {
  warn(
    `FLOCI_VERSION env is not set; cannot verify against supported range ${range}. ` +
      `Set FLOCI_VERSION=<x.y.z> (or SKIP_FLOCI_CHECK=1 to silence).`,
  );
  process.exit(0);
}

const rangeMatch = range.match(/^\^(\d+)\.(\d+)(?:\.(\d+))?$/);
if (!rangeMatch) {
  warn(
    `Unsupported floci.version range "${range}" in package.json. ` +
      `Only caret minor ranges like "^1.5" are recognised by this checker.`,
  );
  process.exit(0);
}
const rMaj = Number(rangeMatch[1]);
const rMin = Number(rangeMatch[2]);
const rPat = Number(rangeMatch[3] ?? "0");

const versionMatch = actual.match(/^(\d+)\.(\d+)\.(\d+)/);
if (!versionMatch) {
  warn(`FLOCI_VERSION="${actual}" is not a valid semver; expected x.y.z.`);
  process.exit(0);
}
const vMaj = Number(versionMatch[1]);
const vMin = Number(versionMatch[2]);
const vPat = Number(versionMatch[3]);

const satisfies =
  vMaj === rMaj &&
  (vMin > rMin || (vMin === rMin && vPat >= rPat));

if (!satisfies) {
  warn(
    `Floci ${actual} is outside the supported range ${range}. ` +
      `Update docker-compose.yml / workflow / FLOCI_VERSION env to a version satisfying ${range}, ` +
      `or bump floci.version in package.json if intentional.`,
  );
  process.exit(0);
}

ok(`Floci ${actual} satisfies ${range}.`);
