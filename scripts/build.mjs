import {cpSync, existsSync, mkdirSync, rmSync} from "node:fs";
import {execSync} from "node:child_process";
import {join} from "node:path";

const projectRoot = process.cwd();
const distDir = join(projectRoot, "dist");
const outputDir = join(distDir, "chrome-extension");
const packageZip = join(distDir, "password-pusher-chrome-extension.zip");

rmSync(outputDir, {recursive: true, force: true});
mkdirSync(outputDir, {recursive: true});

cpSync(join(projectRoot, "manifest.json"), join(outputDir, "manifest.json"));
cpSync(join(projectRoot, "src"), join(outputDir, "src"), {recursive: true});

if (existsSync(packageZip)) {
  rmSync(packageZip, {force: true});
}

mkdirSync(distDir, {recursive: true});
execSync(`cd "${outputDir}" && zip -r "${packageZip}" .`, {stdio: "inherit"});

console.log(`Built extension package: ${packageZip}`);
