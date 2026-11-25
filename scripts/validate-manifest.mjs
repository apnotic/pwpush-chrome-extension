import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

const projectRoot = process.cwd();
const manifestPath = join(projectRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const requiredKeys = ["manifest_version", "name", "version", "background", "default_locale"];
for (const key of requiredKeys) {
  if (!(key in manifest)) {
    throw new Error(`manifest.json is missing required key: ${key}`);
  }
}

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use manifest_version 3");
}

const defaultLocale = manifest.default_locale;
if (typeof defaultLocale !== "string" || defaultLocale.length === 0) {
  throw new Error("manifest.json default_locale must be a non-empty string");
}

const defaultLocaleMessages = join(projectRoot, "_locales", defaultLocale, "messages.json");
if (!existsSync(defaultLocaleMessages)) {
  throw new Error(`Missing locale catalog for default_locale "${defaultLocale}": ${defaultLocaleMessages}`);
}

const messages = JSON.parse(readFileSync(defaultLocaleMessages, "utf8"));
for (const messageKey of ["extName", "extDescription", "actionTitle"]) {
  if (!messages[messageKey]?.message) {
    throw new Error(`${defaultLocaleMessages} is missing required message key: ${messageKey}`);
  }
}

console.log("manifest.json looks valid for MV3 basics.");
