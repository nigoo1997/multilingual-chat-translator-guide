import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json 必须使用 Manifest V3");
}

const requiredFiles = [
  "manifest.json",
  "README.md",
  "EDGE.md",
  "CHROME.md",
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || [])
].filter(Boolean);

for (const relativePath of new Set(requiredFiles)) {
  await access(path.join(root, relativePath));
}

const scripts = [
  "src/background.js",
  "src/content.js",
  "src/options.js",
  "src/popup.js"
];

for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, script)], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`${script} 语法检查失败：\n${result.stderr}`);
  }
}

console.log(`检查通过：Manifest V${manifest.manifest_version}，${requiredFiles.length} 个必需文件，${scripts.length} 个脚本。`);
