// src/index.ts
var DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 256;
function tokenizeLocalEmbeddingText(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
}
function fnv1a(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function addHashedFeature(vector, feature, weight) {
  const hash = fnv1a(feature);
  const sign = (hash & 1) === 0 ? 1 : -1;
  const index = hash % vector.length;
  vector[index] = (vector[index] ?? 0) + sign * weight;
}
function embedTextLocal(text, options = {}) {
  const dimensions = options.dimensions ?? DEFAULT_LOCAL_EMBEDDING_DIMENSIONS;
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new RangeError(`Local embedding dimensions must be a positive integer: ${dimensions}`);
  }
  const vector = new Array(dimensions).fill(0);
  const tokens = tokenizeLocalEmbeddingText(text);
  for (const token of tokens) {
    addHashedFeature(vector, token, 1);
    if (options.includeCharacterBigrams ?? true) {
      for (let index = 0; index < token.length - 1; index += 1) {
        addHashedFeature(vector, `#${token.slice(index, index + 2)}`, 0.5);
      }
    }
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / norm);
}
function embedTextLocalFloat32(text, options = {}) {
  return Float32Array.from(embedTextLocal(text, options));
}
export {
  DEFAULT_LOCAL_EMBEDDING_DIMENSIONS,
  embedTextLocal,
  embedTextLocalFloat32,
  tokenizeLocalEmbeddingText
};
//# sourceMappingURL=index.js.map