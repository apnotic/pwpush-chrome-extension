import {readFileSync} from "node:fs";
import {join} from "node:path";

const projectRoot = process.cwd();
const manifestPath = join(projectRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const requiredKeys = ["manifest_version", "name", "version", "background"];
for (const key of requiredKeys) {
  if (!(key in manifest)) {
    throw new Error(`manifest.json is missing required key: ${key}`);
  }
}

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use manifest_version 3");
}

console.log("manifest.json looks valid for MV3 basics.");
