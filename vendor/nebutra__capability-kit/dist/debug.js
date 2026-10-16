// src/debug.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
function normalizeCapabilityName(capability) {
  const normalized = capability.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("Capability name is required for debug storage.");
  }
  return normalized;
}
function capabilityDebugPath(capability, root = process.cwd()) {
  return join(root, ".nebutra", "debug", `${normalizeCapabilityName(capability)}.jsonl`);
}
async function appendCapabilityDebug(capability, entry, options = {}) {
  const path = capabilityDebugPath(capability, options.root ?? process.cwd());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), ...entry })}
`, {
    flag: "a"
  });
}
async function readCapabilityDebug(capability, options = {}) {
  try {
    const raw = await readFile(
      capabilityDebugPath(capability, options.root ?? process.cwd()),
      "utf8"
    );
    return raw.trim().split("\n").filter(Boolean).slice(-(options.limit ?? 10)).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
export {
  appendCapabilityDebug,
  capabilityDebugPath,
  readCapabilityDebug
};
//# sourceMappingURL=debug.js.map