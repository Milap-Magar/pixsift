// Diagnoses the MongoDB side of PixSift.
//
//   bun run db:check
//
// Prints what's stored, which indexes exist, and — the part that matters —
// `explain()` output for the two hot queries, so you can SEE whether Mongo is
// walking an index or scanning the whole collection. If the feed ever gets slow,
// this is the first thing to run.

import { PINS_COLLECTION, listPins, pinsCollection } from "../lib/db/pins";
import { getClient, DB_NAME } from "../lib/mongodb";

/** The two things that make a query slow: reading everything, or sorting in RAM. */
type Explained = {
  stage: string;
  indexName: string;
  docsExamined: number;
  keysExamined: number;
  returned: number;
  millis: number;
  inMemorySort: boolean;
};

/** Just the slice of Mongo's explain output this script reads. */
type ExplainNode = {
  stage?: string;
  indexName?: string;
  queryPlan?: ExplainNode;
  inputStage?: ExplainNode;
};

type ExplainOutput = {
  queryPlanner?: { winningPlan?: ExplainNode };
  executionStats?: {
    totalDocsExamined?: number;
    totalKeysExamined?: number;
    nReturned?: number;
    executionTimeMillis?: number;
  };
};

function summarise(explain: ExplainOutput): Explained {
  const exec = explain.executionStats ?? {};
  const winning = explain.queryPlanner?.winningPlan ?? {};

  // Walk down to the leaf stage — that's the one that says IXSCAN or COLLSCAN.
  let node: ExplainNode | undefined = winning.queryPlan ?? winning;
  let inMemorySort = false;
  let indexName = "—";

  while (node) {
    if (node.stage === "SORT") inMemorySort = true;
    if (node.indexName) indexName = node.indexName;
    if (!node.inputStage) break;
    node = node.inputStage;
  }

  return {
    stage: node?.stage ?? "?",
    indexName,
    docsExamined: exec.totalDocsExamined ?? -1,
    keysExamined: exec.totalKeysExamined ?? -1,
    returned: exec.nReturned ?? -1,
    millis: exec.executionTimeMillis ?? -1,
    inMemorySort,
  };
}

function report(label: string, e: Explained) {
  // The ideal: an IXSCAN that examines about as many documents as it returns.
  const ok = e.stage === "IXSCAN" && !e.inMemorySort;
  console.log(`\n${ok ? "✓" : "✗"} ${label}`);
  console.log(`    plan          ${e.stage} (${e.indexName})`);
  console.log(`    examined      ${e.keysExamined} keys / ${e.docsExamined} docs → ${e.returned} returned`);
  console.log(`    sorted in RAM ${e.inMemorySort ? "YES — needs an index that matches the sort" : "no"}`);
  console.log(`    server time   ${e.millis}ms`);
}

try {
  const pins = await pinsCollection();
  const total = await pins.estimatedDocumentCount();

  console.log(`${DB_NAME}.${PINS_COLLECTION} — ${total} pins`);

  const indexes = await pins.indexes();
  console.log(`\nIndexes (${indexes.length}):`);
  for (const index of indexes) {
    const flags = [index.unique && "unique", index.sparse && "sparse", index.weights && "text"]
      .filter(Boolean)
      .join(", ");
    console.log(`  · ${index.name}  ${JSON.stringify(index.key)}${flags ? `  [${flags}]` : ""}`);
  }

  // 1. The feed — newest first. Should be an IXSCAN on feed_newest, no SORT stage.
  report(
    "feed: newest 24",
    summarise(
      await pins
        .find({})
        .sort({ createdAt: -1, _id: -1 })
        .limit(24)
        .explain("executionStats"),
    ),
  );

  // 2. Full-text search. Should be a TEXT/IXSCAN on search_text, never a COLLSCAN.
  report(
    'search: "mountain"',
    summarise(await pins.find({ $text: { $search: "mountain" } }).explain("executionStats")),
  );

  // 3. End-to-end timing through the real helper, including the network hop.
  const started = Date.now();
  const page = await listPins({ limit: 24 });
  console.log(
    `\n· listPins() returned ${page.pins.length} pins in ${Date.now() - started}ms round trip` +
      `${page.nextCursor ? " (more pages available)" : ""}`,
  );

  if (page.pins[0]) {
    const { title, description, imageUrl } = page.pins[0];
    console.log(`  newest: "${title}" — ${description?.slice(0, 48)}…`);
    console.log(`          ${imageUrl}`);
  }
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await (await getClient()).close();
}
