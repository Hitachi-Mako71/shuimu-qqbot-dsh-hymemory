import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
const files = [
  ...new Set(
    cp
      .execFileSync("git", [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
      ])
      .toString()
      .split("\0")
      .filter((p) => p && fs.existsSync(p)),
  ),
];
const errors = [];
const forbidden =
  /(?:^|\/)(?:node_modules|data|logs|\.run|\.privacy|hindsight|exports|\.venv)(?:\/|$)|(?:^|\/)\.env$|credentials\.json$|\.(?:safetensors|onnx|sqlite3?|pyc)$/;
for (const p of files) {
  if (forbidden.test(p) && !p.startsWith("app/dependency-locks/"))
    errors.push("Private/runtime path tracked: " + p);
}
const active = files.filter(
  (p) =>
    p.endsWith(".md") &&
    (p === "README.md" ||
      p === "CONTRIBUTING.md" ||
      p === "app/README.md" ||
      p === "research/README.md" ||
      /^docs\/(?:deployment|usage|development|decisions)\//.test(p)),
);
let links = 0;
for (const p of active) {
  const text = fs.readFileSync(p, "utf8");
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    const href = m[1];
    if (/^(?:https?:|mailto:|#|[A-Za-z]:)/.test(href)) continue;
    const url = decodeURIComponent(href.split("#")[0]);
    if (!url) continue;
    links++;
    if (!fs.existsSync(path.resolve(path.dirname(p), url)))
      errors.push("Broken local link: " + p + " -> " + href);
  }
}
const pkg = JSON.parse(fs.readFileSync("app/dsh-hymemory-plugin/package.json")),
  versions = JSON.parse(fs.readFileSync("app/versions.json"));
if (pkg.version !== versions.cordis_plugin)
  errors.push("Source version mismatch");
const archive = "app/packages/dsh-hymemory-qq-" + pkg.version + ".tgz";
let packaged = 0;
if (!fs.existsSync(archive)) errors.push("Missing candidate package");
else {
  const b = fs.readFileSync(archive),
    tar = zlib.gunzipSync(b);
  for (let at = 0; at + 512 <= tar.length; ) {
    const h = tar.subarray(at, at + 512);
    if (h.every((x) => x === 0)) break;
    const str = (a, n) =>
      h
        .subarray(a, a + n)
        .toString()
        .replace(/\0.*$/s, "");
    const size = parseInt(str(124, 12).trim() || "0", 8),
      type = str(156, 1),
      name = (str(345, 155) ? str(345, 155) + "/" : "") + str(0, 100);
    if (type === "0" || type === "") {
      if (!name.startsWith("package/")) errors.push("Unsafe archive path");
      const rel = name.replace(/^package\//, "");
      if (forbidden.test(rel)) errors.push("Private path in package: " + rel);
      const source = "app/dsh-hymemory-plugin/" + rel;
      if (
        !fs.existsSync(source) ||
        !tar.subarray(at + 512, at + 512 + size).equals(fs.readFileSync(source))
      )
        errors.push("Package/source byte mismatch: " + rel);
      packaged++;
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  const lock = fs.readFileSync(
      "app/dependency-locks/qqbot-profile/pnpm-lock.yaml",
      "utf8",
    ),
    integrity = "sha512-" + createHash("sha512").update(b).digest("base64");
  if (
    !lock.includes(integrity) ||
    !lock.includes("dsh-hymemory-qq-" + pkg.version + ".tgz")
  )
    errors.push("Profile lock/package integrity mismatch");
}
const patch = fs.readFileSync(
  "app/patches/@tencent-connect__dsh-qqbot@0.5.2.patch",
);
if (
  createHash("sha256").update(patch).digest("hex") !== versions.qq_patch_sha256
)
  errors.push("Pinned patch bytes mismatch");
for (const p of files.filter(
  (p) =>
    p.endsWith(".mjs") &&
    (p.startsWith("scripts/") || p.startsWith("research/tools/")),
)) {
  const r = cp.spawnSync(process.execPath, ["--check", p], {
    encoding: "utf8",
  });
  if (r.status !== 0) errors.push("Syntax: " + p);
  const text = fs.readFileSync(p, "utf8");
  for (const m of text.matchAll(
    /(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g,
  ))
    if (!fs.existsSync(path.resolve(path.dirname(p), m[2])))
      errors.push("Broken research import: " + p + " -> " + m[2]);
}
console.log(
  JSON.stringify(
    {
      files: files.length,
      activeDocuments: active.length,
      localLinks: links,
      packagedFiles: packaged,
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) process.exitCode = 1;

