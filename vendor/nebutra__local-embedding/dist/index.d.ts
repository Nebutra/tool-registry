declare const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 256;
interface LocalEmbeddingOptions {
    readonly dimensions?: number;
    readonly includeCharacterBigrams?: boolean;
}
declare function tokenizeLocalEmbeddingText(text: string): string[];
declare function embedTextLocal(text: string, options?: LocalEmbeddingOptions): number[];
declare function embedTextLocalFloat32(text: string, options?: LocalEmbeddingOptions): Float32Array;

export { DEFAULT_LOCAL_EMBEDDING_DIMENSIONS, type LocalEmbeddingOptions, embedTextLocal, embedTextLocalFloat32, tokenizeLocalEmbeddingText };
