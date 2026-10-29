/**
 * @nebutra/capability-kit — neutral primitives every capability package
 * re-implemented near-identically:
 *
 *  - `CapabilityError`: an Error with a machine-stable `code`, a mandatory
 *    human `suggestion`, and `toJSON()`. Subclasses keep their own name +
 *    empty-suggestion fallback so existing contracts are preserved.
 *  - `DoctorReportBase` / `DoctorCheck`: the shared health-report shape.
 *  - `runCapabilityCli`: the `doctor` / `debug <arg>` argv switch that ~9
 *    `src/cli.ts` files copied verbatim.
 *  - `selectCapabilityTenant` / `requireCapabilityTenant`: package-local
 *    explicit-tenant/default-tenant selection. Request-scoped tenant context,
 *    RLS, and tenant isolation still belong to `@nebutra/tenant`.
 */
interface CapabilityErrorInit {
    readonly code: string;
    /** Actionable remediation hint. Empty falls back (see opts). */
    readonly suggestion: string;
    readonly cause?: unknown;
}
interface CapabilityErrorOptions {
    /** Subclass error name (defaults to "CapabilityError"). */
    readonly name?: string;
    /** Message used when `suggestion` is empty/blank. */
    readonly emptySuggestionFallback?: string;
}
declare class CapabilityError extends Error {
    readonly code: string;
    readonly suggestion: string;
    constructor(message: string, init: CapabilityErrorInit, opts?: CapabilityErrorOptions);
    toJSON(): {
        name: string;
        message: string;
        code: string;
        suggestion: string;
    };
}
interface CapabilityTenantSelection {
    readonly explicit?: string | undefined;
    readonly fallback?: string | undefined;
}
interface RequireCapabilityTenantOptions extends CapabilityTenantSelection {
    readonly onMissing: () => Error;
}
declare function selectCapabilityTenant(selection: CapabilityTenantSelection): string | null;
declare function requireCapabilityTenant(options: RequireCapabilityTenantOptions): string;
/** One health probe result. */
interface DoctorCheck {
    readonly ok: boolean;
    readonly detail: string;
}
/** The minimal shared doctor-report shape; packages may extend it. */
interface DoctorReportBase {
    readonly ok: boolean;
    readonly durationMs: number;
}
interface RunCapabilityCliOptions {
    /** Capability name stamped onto every output object. */
    readonly capability: string;
    /** `doctor` handler — returns a (serializable) health report. */
    readonly doctor: () => Promise<unknown> | unknown;
    /** Optional `debug <arg>` handler — returns a serializable inspection. */
    readonly debug?: (arg?: string) => Promise<unknown> | unknown;
    /** Defaults to `process.argv`. Injectable for tests. */
    readonly argv?: readonly string[];
    /** Defaults to `process.stdout.write`. Injectable for tests. */
    readonly write?: (s: string) => void;
    /** Defaults to `process.stderr.write`. Injectable for tests. */
    readonly writeErr?: (s: string) => void;
    /** Defaults to setting `process.exitCode`. Injectable for tests. */
    readonly onUnknown?: (command: string) => void;
}
/**
 * The `doctor` / `debug` argv switch shared by every capability CLI. Output
 * is always `{ capability, ...result }` as pretty JSON — identical to what
 * the hand-rolled cli.ts files produced.
 */
declare function runCapabilityCli(opts: RunCapabilityCliOptions): Promise<void>;

export { CapabilityError, type CapabilityErrorInit, type CapabilityErrorOptions, type CapabilityTenantSelection, type DoctorCheck, type DoctorReportBase, type RequireCapabilityTenantOptions, type RunCapabilityCliOptions, requireCapabilityTenant, runCapabilityCli, selectCapabilityTenant };
