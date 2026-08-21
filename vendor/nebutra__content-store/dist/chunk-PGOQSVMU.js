// src/index.ts
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { createRequire } from "module";
import { basename, dirname, join, normalize, relative } from "path";
import {
  appendCapabilityDebug,
  capabilityDebugPath,
  readCapabilityDebug
} from "@nebutra/capability-kit/debug";
import { CapabilityError } from "@nebutra/errors";
import { embedTextLocalFloat32, tokenizeLocalEmbeddingText } from "@nebutra/local-embedding";
var VECTOR_DIMENSIONS = 32;
function safePath(path) {
  const normalized = normalize(path).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new CapabilityError("content-store", "Unsafe content path rejected", {
      suggestion: "Use repo-relative paths inside the content store root.",
      metadata: { path },
      statusCode: 400
    });
  }
  return normalized;
}
function parseContentFrontmatter(content) {
  if (!content.startsWith("---\n")) return { frontmatter: {}, body: content };
  const end = content.indexOf("\n---", 4);
  if (end < 0) return { frontmatter: {}, body: content };
  const raw = content.slice(4, end).trim();
  const frontmatter = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { frontmatter, body: content.slice(end + 4).trimStart() };
}
function serializeContentFrontmatter(frontmatter, body) {
  const frontmatterLines = Object.entries(frontmatter).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}: ${value}`);
  return frontmatterLines.length > 0 ? `---
${frontmatterLines.join("\n")}
---
${body}` : body;
}
function splitContentParagraphs(content) {
  return content.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}
function chunkContentParagraphs(content, maxParagraphs = 4) {
  const parts = splitContentParagraphs(content);
  const chunks = [];
  for (let i = 0; i < parts.length; i += maxParagraphs) {
    chunks.push(parts.slice(i, i + maxParagraphs).join("\n\n"));
  }
  return chunks.length > 0 ? chunks : [content];
}
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}
function escapeFtsQuery(query) {
  return tokenizeLocalEmbeddingText(query).map((term) => `"${term.replaceAll('"', '""')}"`).join(" ");
}
function embedText(value) {
  return embedTextLocalFloat32(value, { dimensions: VECTOR_DIMENSIONS });
}
function vectorBlob(vector) {
  const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
  return new Uint8Array(bytes);
}
function vectorFromBlob(value) {
  if (value instanceof ArrayBuffer) return new Float32Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new Float32Array(new Uint8Array(bytes).buffer);
  }
  return new Float32Array(VECTOR_DIMENSIONS);
}
function l2Distance(left, right) {
  let sum = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}
function numberFrom(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}
function stringFrom(value) {
  return typeof value === "string" ? value : "";
}
function frontmatterWhere(filters, documentAlias, values) {
  return Object.entries(filters).map(([key, value]) => {
    values.push(key, value);
    return `EXISTS (
        SELECT 1 FROM document_frontmatter fm
        WHERE fm.tenant_id = ${documentAlias}.tenant_id
          AND fm.path = ${documentAlias}.path
          AND fm.key = ?
          AND fm.value = ?
      )`;
  }).join(" AND ");
}
function contentDebugPath() {
  return capabilityDebugPath("content-store");
}
async function appendContentDebug(entry) {
  await appendCapabilityDebug("content-store", entry);
}
async function readContentDebug(limit = 10) {
  return readCapabilityDebug("content-store", { limit });
}
var ContentStore = class _ContentStore {
  #root;
  #tenantId;
  #db;
  #vectorMode = "blob";
  constructor(root, tenantId, db) {
    this.#root = root;
    this.#tenantId = tenantId;
    this.#db = db;
  }
  static async open(root, options = {}) {
    await mkdir(root, { recursive: true });
    const db = await openSqliteDatabase(join(root, "index.sqlite"));
    const store = new _ContentStore(root, options.tenantId ?? "local", db);
    await mkdir(store.filesRoot(), { recursive: true });
    await store.#initializeSchema();
    await store.reindex();
    return store;
  }
  indexPath() {
    return join(this.#root, "index.sqlite");
  }
  filesRoot() {
    return join(this.#root, "files", this.#tenantId);
  }
  async write(path, content) {
    const rel = safePath(path);
    const full = join(this.filesRoot(), rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
    await this.#indexFile(full);
    await appendContentDebug({ type: "write", tenantId: this.#tenantId, path: rel });
  }
  async read(path) {
    return readFile(join(this.filesRoot(), safePath(path)), "utf8");
  }
  chunk(content, maxParagraphs = 4) {
    return chunkContentParagraphs(content, maxParagraphs);
  }
  async reindex() {
    await this.#clearTenantIndex();
    const files = await walk(this.filesRoot());
    for (const file of files) {
      await this.#indexFile(file);
    }
    await appendContentDebug({ type: "reindex", tenantId: this.#tenantId, files: files.length });
  }
  search() {
    return new SearchBuilder(this);
  }
  async doctor() {
    const indexed = await this.#indexedCount();
    const suggestion = indexed === 0 ? "Write at least one file or run `pnpm content:query <term>` after indexing content." : this.#vectorMode === "blob" ? "Rebuild the native SQLite/vector dependencies to enable sqlite-vec vec0 KNN; FTS and persisted vector blobs are still active." : void 0;
    return {
      ok: indexed > 0,
      indexed,
      backend: "sqlite",
      indexPath: this.indexPath(),
      driver: this.#db.driver,
      fts: true,
      vector: {
        table: "chunk_vectors",
        mode: this.#vectorMode,
        available: this.#vectorMode === "vec0",
        dimensions: VECTOR_DIMENSIONS
      },
      ...suggestion !== void 0 ? { suggestion } : {}
    };
  }
  async close() {
    await this.#db.close();
  }
  async #indexFile(full) {
    const content = await readFile(full, "utf8");
    const rel = relative(this.filesRoot(), full);
    const { frontmatter, body } = parseContentFrontmatter(content);
    const doc = {
      tenantId: this.#tenantId,
      path: rel,
      body,
      frontmatter,
      chunks: this.chunk(body)
    };
    await this.#transaction(async () => {
      await this.#deleteIndexedPath(rel);
      await this.#run(
        `INSERT INTO documents (tenant_id, path, schema, frontmatter_json, body, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          doc.tenantId,
          doc.path,
          doc.frontmatter.schema ?? null,
          JSON.stringify(doc.frontmatter),
          doc.body,
          (/* @__PURE__ */ new Date()).toISOString()
        ]
      );
      for (const [key, value] of Object.entries(doc.frontmatter)) {
        await this.#run(
          `INSERT INTO document_frontmatter (tenant_id, path, key, value)
           VALUES (?, ?, ?, ?)`,
          [doc.tenantId, doc.path, key, value]
        );
      }
      for (let index = 0; index < doc.chunks.length; index += 1) {
        const chunk = doc.chunks[index] ?? "";
        await this.#run(
          `INSERT INTO chunks (tenant_id, path, chunk_index, schema, chunk)
           VALUES (?, ?, ?, ?, ?)`,
          [doc.tenantId, doc.path, index, doc.frontmatter.schema ?? null, chunk]
        );
        const id = numberFrom((await this.#get("SELECT last_insert_rowid() AS id"))?.id);
        await this.#run(
          `INSERT INTO chunks_fts (rowid, tenant_id, path, schema, chunk)
           VALUES (?, ?, ?, ?, ?)`,
          [id, doc.tenantId, doc.path, doc.frontmatter.schema ?? null, chunk]
        );
        await this.#run(
          `INSERT INTO chunk_vector_meta (chunk_id, tenant_id, path, chunk_index)
           VALUES (?, ?, ?, ?)`,
          [id, doc.tenantId, doc.path, index]
        );
        await this.#run("INSERT INTO chunk_vectors (rowid, embedding) VALUES (?, ?)", [
          id,
          vectorBlob(embedText(chunk))
        ]);
      }
    });
  }
  async searchTopK(query, filters, k) {
    const ftsQuery = escapeFtsQuery(query);
    const hits = ftsQuery.length > 0 ? await this.#ftsSearch(ftsQuery, filters, k) : await this.#listDocuments(filters, k);
    if (hits.length >= k || query.trim().length === 0) return hits.slice(0, k);
    const existing = new Set(hits.map((hit) => hit.path));
    const vectorHits = await this.#vectorSearch(query, filters, k);
    return [...hits, ...vectorHits.filter((hit) => !existing.has(hit.path))].slice(0, k);
  }
  async #ftsSearch(ftsQuery, filters, k) {
    const values = [ftsQuery, this.#tenantId];
    const filterSql = frontmatterWhere(filters, "d", values);
    values.push(k);
    const rows = await this.#all(
      `SELECT d.tenant_id, d.path, d.schema, c.chunk AS excerpt, bm25(chunks_fts) AS rank
       FROM chunks_fts
       JOIN chunks c ON c.id = chunks_fts.rowid
       JOIN documents d ON d.tenant_id = c.tenant_id AND d.path = c.path
       WHERE chunks_fts MATCH ? AND d.tenant_id = ?${filterSql ? ` AND ${filterSql}` : ""}
       ORDER BY rank ASC, d.path ASC
       LIMIT ?`,
      values
    );
    return dedupeHits(
      rows.map((row) => ({
        tenantId: stringFrom(row.tenant_id),
        path: stringFrom(row.path),
        score: 1 / (1 + Math.abs(numberFrom(row.rank))),
        ...row.schema !== null && row.schema !== void 0 ? { schema: stringFrom(row.schema) } : {},
        excerpt: stringFrom(row.excerpt)
      }))
    );
  }
  async #vectorSearch(query, filters, k) {
    return this.#vectorMode === "vec0" ? this.#vec0Search(query, filters, k) : this.#blobVectorSearch(query, filters, k);
  }
  async #vec0Search(query, filters, k) {
    const values = [vectorBlob(embedText(query)), this.#tenantId];
    const filterSql = frontmatterWhere(filters, "d", values);
    values.push(k);
    const rows = await this.#all(
      `SELECT d.tenant_id, d.path, d.schema, c.chunk AS excerpt,
              vec_distance_l2(v.embedding, ?) AS distance
       FROM chunk_vectors v
       JOIN chunks c ON c.id = v.rowid
       JOIN documents d ON d.tenant_id = c.tenant_id AND d.path = c.path
       WHERE d.tenant_id = ?${filterSql ? ` AND ${filterSql}` : ""}
       ORDER BY distance ASC, d.path ASC
       LIMIT ?`,
      values
    );
    return dedupeHits(
      rows.map((row) => ({
        tenantId: stringFrom(row.tenant_id),
        path: stringFrom(row.path),
        score: 1 / (1 + numberFrom(row.distance)),
        ...row.schema !== null && row.schema !== void 0 ? { schema: stringFrom(row.schema) } : {},
        excerpt: stringFrom(row.excerpt)
      }))
    );
  }
  async #blobVectorSearch(query, filters, k) {
    const values = [this.#tenantId];
    const filterSql = frontmatterWhere(filters, "d", values);
    const rows = await this.#all(
      `SELECT d.tenant_id, d.path, d.schema, c.chunk AS excerpt, v.embedding
       FROM chunk_vectors v
       JOIN chunks c ON c.id = v.rowid
       JOIN documents d ON d.tenant_id = c.tenant_id AND d.path = c.path
       WHERE d.tenant_id = ?${filterSql ? ` AND ${filterSql}` : ""}`,
      values
    );
    const probe = embedText(query);
    return dedupeHits(
      rows.map((row) => {
        const distance = l2Distance(probe, vectorFromBlob(row.embedding));
        return {
          tenantId: stringFrom(row.tenant_id),
          path: stringFrom(row.path),
          score: 1 / (1 + distance),
          ...row.schema !== null && row.schema !== void 0 ? { schema: stringFrom(row.schema) } : {},
          excerpt: stringFrom(row.excerpt)
        };
      }).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    ).slice(0, k);
  }
  async #listDocuments(filters, k) {
    const values = [this.#tenantId];
    const filterSql = frontmatterWhere(filters, "d", values);
    values.push(k);
    return (await this.#all(
      `SELECT d.tenant_id, d.path, d.schema, COALESCE(c.chunk, d.body) AS excerpt
         FROM documents d
         LEFT JOIN chunks c ON c.tenant_id = d.tenant_id AND c.path = d.path AND c.chunk_index = 0
         WHERE d.tenant_id = ?${filterSql ? ` AND ${filterSql}` : ""}
         ORDER BY d.path ASC
         LIMIT ?`,
      values
    )).map((row) => ({
      tenantId: stringFrom(row.tenant_id),
      path: stringFrom(row.path),
      score: 1,
      ...row.schema !== null && row.schema !== void 0 ? { schema: stringFrom(row.schema) } : {},
      excerpt: stringFrom(row.excerpt)
    }));
  }
  async #initializeSchema() {
    await this.#db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS documents (
        tenant_id TEXT NOT NULL,
        path TEXT NOT NULL,
        schema TEXT,
        frontmatter_json TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, path)
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        schema TEXT,
        chunk TEXT NOT NULL,
        UNIQUE (tenant_id, path, chunk_index)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
        USING fts5(tenant_id UNINDEXED, path UNINDEXED, schema UNINDEXED, chunk);
      CREATE TABLE IF NOT EXISTS chunk_vector_meta (
        chunk_id INTEGER PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_frontmatter (
        tenant_id TEXT NOT NULL,
        path TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (tenant_id, path, key)
      );
    `);
    if (process.env.NEBUTRA_CONTENT_STORE_ENABLE_VEC0 === "1") {
      try {
        await this.#db.exec(
          `CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors
           USING vec0(embedding float[${VECTOR_DIMENSIONS}])`
        );
      } catch {
        await this.#db.exec(`
          CREATE TABLE IF NOT EXISTS chunk_vectors (
            rowid INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL
          );
        `);
      }
    } else {
      await this.#db.exec(`
        CREATE TABLE IF NOT EXISTS chunk_vectors (
          rowid INTEGER PRIMARY KEY,
          embedding BLOB NOT NULL
        );
      `);
    }
    const table = await this.#get("SELECT sql FROM sqlite_master WHERE name = 'chunk_vectors'");
    this.#vectorMode = stringFrom(table?.sql).includes("USING vec0") ? "vec0" : "blob";
  }
  async #clearTenantIndex() {
    const rows = await this.#all("SELECT id FROM chunks WHERE tenant_id = ?", [this.#tenantId]);
    await this.#transaction(async () => {
      for (const row of rows) {
        const id = numberFrom(row.id);
        await this.#run("DELETE FROM chunks_fts WHERE rowid = ?", [id]);
        await this.#run("DELETE FROM chunk_vectors WHERE rowid = ?", [id]);
        await this.#run("DELETE FROM chunk_vector_meta WHERE chunk_id = ?", [id]);
      }
      await this.#run("DELETE FROM document_frontmatter WHERE tenant_id = ?", [this.#tenantId]);
      await this.#run("DELETE FROM chunks WHERE tenant_id = ?", [this.#tenantId]);
      await this.#run("DELETE FROM documents WHERE tenant_id = ?", [this.#tenantId]);
    });
  }
  async #deleteIndexedPath(path) {
    const rows = await this.#all("SELECT id FROM chunks WHERE tenant_id = ? AND path = ?", [
      this.#tenantId,
      path
    ]);
    for (const row of rows) {
      const id = numberFrom(row.id);
      await this.#run("DELETE FROM chunks_fts WHERE rowid = ?", [id]);
      await this.#run("DELETE FROM chunk_vectors WHERE rowid = ?", [id]);
      await this.#run("DELETE FROM chunk_vector_meta WHERE chunk_id = ?", [id]);
    }
    await this.#run("DELETE FROM chunks WHERE tenant_id = ? AND path = ?", [this.#tenantId, path]);
    await this.#run("DELETE FROM documents WHERE tenant_id = ? AND path = ?", [
      this.#tenantId,
      path
    ]);
    await this.#run("DELETE FROM document_frontmatter WHERE tenant_id = ? AND path = ?", [
      this.#tenantId,
      path
    ]);
  }
  async #indexedCount() {
    const row = await this.#get("SELECT COUNT(*) AS count FROM documents WHERE tenant_id = ?", [
      this.#tenantId
    ]);
    return numberFrom(row?.count);
  }
  async #transaction(work) {
    await this.#db.exec("BEGIN IMMEDIATE");
    try {
      await work();
      await this.#db.exec("COMMIT");
    } catch (cause) {
      await Promise.resolve(this.#db.exec("ROLLBACK")).catch(() => void 0);
      throw cause;
    }
  }
  async #run(sql, values = []) {
    (await this.#db.prepare(sql)).run(values);
  }
  async #get(sql, values = []) {
    return (await this.#db.prepare(sql)).get(values);
  }
  async #all(sql, values = []) {
    return (await this.#db.prepare(sql)).all(values);
  }
};
var SearchBuilder = class {
  #store;
  #query = "";
  #filters = {};
  constructor(store) {
    this.#store = store;
  }
  query(query) {
    this.#query = query.toLowerCase();
    return this;
  }
  filter(filters) {
    this.#filters = filters;
    return this;
  }
  async topK(k) {
    return this.#store.searchTopK(this.#query, this.#filters, k);
  }
};
function dedupeHits(hits) {
  const byPath = /* @__PURE__ */ new Map();
  for (const hit of hits) {
    const existing = byPath.get(hit.path);
    if (!existing || hit.score > existing.score) byPath.set(hit.path, hit);
  }
  return Array.from(byPath.values()).sort(
    (left, right) => right.score - left.score || left.path.localeCompare(right.path)
  );
}
async function openSqliteDatabase(indexPath) {
  try {
    const sqliteVec = await import("@dao-xyz/sqlite3-vec");
    const loadExtension = compatibleSqliteVecExtension(sqliteVec.resolveNativeExtensionPath);
    if (loadExtension === false) {
      throw new Error("No compatible sqlite-vec native extension available");
    }
    const database = await sqliteVec.createDatabase({
      database: indexPath,
      loadExtension
    });
    await database.open();
    return new VecSqliteDatabase(database);
  } catch {
    return openNodeSqliteDatabase(indexPath);
  }
}
function compatibleSqliteVecExtension(resolveNativeExtensionPath) {
  const extensionPath = resolveNativeExtensionPath?.();
  if (extensionPath === void 0) return false;
  return basename(extensionPath) === `sqlite-vec-${sqliteVecPlatformTriple()}.${sqliteVecLibraryExt()}` ? extensionPath : false;
}
function sqliteVecPlatformTriple() {
  if (process.platform === "darwin") return `darwin-${process.arch}`;
  if (process.platform === "win32") return `win32-${process.arch}`;
  if (process.platform === "linux") return `linux-${process.arch}-gnu`;
  return `${process.platform}-${process.arch}`;
}
function sqliteVecLibraryExt() {
  if (process.platform === "darwin") return "dylib";
  if (process.platform === "win32") return "dll";
  return "so";
}
var VecSqliteDatabase = class {
  driver = "sqlite3-vec";
  #database;
  constructor(database) {
    this.#database = database;
  }
  exec(sql) {
    return this.#database.exec(sql);
  }
  async prepare(sql) {
    return new VecSqlStatement(await this.#database.prepare(sql));
  }
  close() {
    return this.#database.close();
  }
};
var VecSqlStatement = class {
  #statement;
  constructor(statement) {
    this.#statement = statement;
  }
  get(values = []) {
    return this.#statement.get([...values]);
  }
  all(values = []) {
    return this.#statement.all([...values]);
  }
  run(values = []) {
    this.#statement.run([...values]);
  }
};
async function openNodeSqliteDatabase(indexPath) {
  try {
    const module = await importNodeSqlite();
    return new NodeSqliteDatabase(new module.DatabaseSync(indexPath));
  } catch (cause) {
    throw new CapabilityError("content-store", "SQLite index backend is unavailable", {
      suggestion: "Install native SQLite dependencies or run on Node 24+ with node:sqlite available.",
      ...cause instanceof Error ? { cause } : {}
    });
  }
}
async function importNodeSqlite() {
  const require2 = createRequire(import.meta.url);
  return require2("node:sqlite");
}
var NodeSqliteDatabase = class {
  driver = "node:sqlite";
  #database;
  constructor(database) {
    this.#database = database;
  }
  exec(sql) {
    this.#database.exec(sql);
  }
  prepare(sql) {
    return new NodeSqlStatement(this.#database.prepare(sql));
  }
  close() {
    this.#database.close();
  }
};
var NodeSqlStatement = class {
  #statement;
  constructor(statement) {
    this.#statement = statement;
  }
  get(values = []) {
    return this.#statement.get(...values);
  }
  all(values = []) {
    return this.#statement.all(...values);
  }
  run(values = []) {
    this.#statement.run(...values);
  }
};

export {
  parseContentFrontmatter,
  serializeContentFrontmatter,
  splitContentParagraphs,
  chunkContentParagraphs,
  contentDebugPath,
  readContentDebug,
  ContentStore,
  SearchBuilder
};
//# sourceMappingURL=chunk-PGOQSVMU.js.map