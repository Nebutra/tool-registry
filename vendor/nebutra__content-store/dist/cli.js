import {
  ContentStore,
  readContentDebug
} from "./chunk-PGOQSVMU.js";

// src/cli.ts
var command = process.argv[2] ?? "doctor";
var store = await ContentStore.open(process.env.CONTENT_STORE_ROOT ?? ".nebutra/content-store");
try {
  if (command === "doctor") {
    process.stdout.write(
      `${JSON.stringify({ capability: "content-store", ...await store.doctor() }, null, 2)}
`
    );
  } else if (command === "query") {
    const query = process.argv.slice(3).join(" ");
    process.stdout.write(
      `${JSON.stringify(
        { capability: "content-store", query, hits: await store.search().query(query).topK(10) },
        null,
        2
      )}
`
    );
  } else if (command === "debug") {
    process.stdout.write(
      `${JSON.stringify({ capability: "content-store", entries: await readContentDebug() }, null, 2)}
`
    );
  } else {
    process.stderr.write(`Unknown content-store command: ${command}
`);
    process.exitCode = 1;
  }
} finally {
  await store.close();
}
//# sourceMappingURL=cli.js.map