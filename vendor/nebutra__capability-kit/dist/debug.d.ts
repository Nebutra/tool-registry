interface CapabilityDebugOptions {
    readonly root?: string;
    readonly limit?: number;
}
type CapabilityDebugEntry = Record<string, unknown> & {
    readonly at?: string;
};
declare function capabilityDebugPath(capability: string, root?: string): string;
declare function appendCapabilityDebug(capability: string, entry: CapabilityDebugEntry, options?: Pick<CapabilityDebugOptions, "root">): Promise<void>;
declare function readCapabilityDebug(capability: string, options?: CapabilityDebugOptions): Promise<unknown[]>;

export { type CapabilityDebugEntry, type CapabilityDebugOptions, appendCapabilityDebug, capabilityDebugPath, readCapabilityDebug };
