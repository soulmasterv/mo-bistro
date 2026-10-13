// Local dependency repair/check only. Never constructs a Database or changes app flags.
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("better-sqlite3/package.json"));
const dependency = createRequire(path.join(root, "package.json"));
function check() {
  const addon = dependency("bindings")({ bindings: "better_sqlite3.node", module_root: root });
  if (typeof addon.Database !== "function") throw Error("Invalid SQLite native module");
  console.log(`SQLite native module loaded (${process.platform}/${process.arch}, Node ABI ${process.versions.modules}); no database opened.`);
}
try {
  check();
} catch {
  if (!process.argv.includes("--repair")) {
    console.error("SQLite native module missing/incompatible. Run npm run setup:sqlite with this same Node runtime.");
    process.exitCode = 1;
  } else {
    // Explicit opt-in to the installed package's official prebuilt installer;
    // does not broadly enable lifecycle scripts or change dependency versions.
    const installer = dependency.resolve("prebuild-install/bin.js");
    const result = spawnSync(process.execPath, [installer], { cwd: root, stdio: "inherit" });
    if (result.status !== 0) {
      console.error("Official prebuilt install failed. Use the package's documented source build with the supported local toolchain; no automatic source-build fallback ran.");
      process.exitCode = 1;
    } else {
      check();
    }
  }
}
