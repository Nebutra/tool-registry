interface ContentStoreOptions {
    readonly tenantId?: string;
}
type ContentIndexBackend = "sqlite3-vec" | "node:sqlite";
type ContentVectorMode = "vec0" | "blob";
interface SearchHit {
    readonly tenantId: string;
    readonly path: string;
    readonly score: number;
    readonly schema?: string;
    readonly excerpt: string;
}
interface ContentStoreDoctorReport {
    readonly ok: boolean;
    readonly indexed: number;
    readonly backend: "sqlite";
    readonly indexPath: string;
    readonly driver: ContentIndexBackend;
    readonly fts: boolean;
    readonly vector: {
        readonly table: "chunk_vectors";
        readonly mode: ContentVectorMode;
        readonly available: boolean;
        readonly dimensions: number;
    };
    readonly suggestion?: string;
}
interface ParsedContentDocument {
    readonly frontmatter: Record<string, string>;
    readonly body: string;
}
declare function parseContentFrontmatter(content: string): ParsedContentDocument;
declare function serializeContentFrontmatter(frontmatter: Record<string, string>, body: string): string;
declare function splitContentParagraphs(content: string): string[];
declare function chunkContentParagraphs(content: string, maxParagraphs?: number): string[];
declare function contentDebugPath(): string;
declare function readContentDebug(limit?: number): Promise<unknown[]>;
declare class ContentStore {
    #private;
    private constructor();
    static open(root: string, options?: ContentStoreOptions): Promise<ContentStore>;
    indexPath(): string;
    filesRoot(): string;
    write(path: string, content: string): Promise<void>;
    read(path: string): Promise<string>;
    chunk(content: string, maxParagraphs?: number): string[];
    reindex(): Promise<void>;
    search(): SearchBuilder;
    doctor(): Promise<ContentStoreDoctorReport>;
    close(): Promise<void>;
    searchTopK(query: string, filters: Record<string, string>, k: number): Promise<SearchHit[]>;
}
declare class SearchBuilder {
    #private;
    constructor(store: ContentStore);
    query(query: string): this;
    filter(filters: Record<string, string>): this;
    topK(k: number): Promise<SearchHit[]>;
}

export { type ContentIndexBackend, ContentStore, type ContentStoreDoctorReport, type ContentStoreOptions, type ContentVectorMode, type ParsedContentDocument, SearchBuilder, type SearchHit, chunkContentParagraphs, contentDebugPath, parseContentFrontmatter, readContentDebug, serializeContentFrontmatter, splitContentParagraphs };
