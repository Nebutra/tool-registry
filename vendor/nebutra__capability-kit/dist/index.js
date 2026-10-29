// src/index.ts
var DEFAULT_EMPTY_SUGGESTION = "No suggestion was provided. This is a bug \u2014 report it with the failing operation.";
var CapabilityError = class extends Error {
  code;
  suggestion;
  constructor(message, init, opts) {
    super(message, init.cause === void 0 ? void 0 : { cause: init.cause });
    this.name = opts?.name ?? "CapabilityError";
    this.suggestion = init.suggestion && init.suggestion.trim().length > 0 ? init.suggestion : opts?.emptySuggestionFallback ?? DEFAULT_EMPTY_SUGGESTION;
    this.code = init.code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      suggestion: this.suggestion
    };
  }
};
function selectCapabilityTenant(selection) {
  if (selection.explicit !== void 0) {
    const explicit = selection.explicit.trim();
    return explicit.length > 0 ? explicit : null;
  }
  const fallback = selection.fallback?.trim();
  if (fallback) return fallback;
  return null;
}
function requireCapabilityTenant(options) {
  const tenantId = selectCapabilityTenant(options);
  if (tenantId) return tenantId;
  throw options.onMissing();
}
async function runCapabilityCli(opts) {
  const argv = opts.argv ?? process.argv;
  const write = opts.write ?? ((s) => void process.stdout.write(s));
  const writeErr = opts.writeErr ?? ((s) => void process.stderr.write(s));
  const command = argv[2] ?? "doctor";
  if (command === "doctor") {
    const report = await opts.doctor();
    write(`${JSON.stringify({ capability: opts.capability, ...report }, null, 2)}
`);
    return;
  }
  if (command === "debug" && opts.debug) {
    const result = await opts.debug(argv[3]);
    write(`${JSON.stringify({ capability: opts.capability, ...result }, null, 2)}
`);
    return;
  }
  if (opts.onUnknown) opts.onUnknown(command);
  else {
    writeErr(`Unknown ${opts.capability} command: ${command}
`);
    process.exitCode = 1;
  }
}
export {
  CapabilityError,
  requireCapabilityTenant,
  runCapabilityCli,
  selectCapabilityTenant
};
//# sourceMappingURL=index.js.map