// OpenNext adapter config for Cloudflare Workers.
//
// `wrangler deploy` expects `.open-next/worker.js`, which only exists after
// `opennextjs-cloudflare build` has run. That command builds the Next app
// itself (in standalone mode) and then bundles the output for workerd — so the
// Cloudflare build step has to call it, not `next build` directly.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // The adapter would otherwise run `bun run build`, which is this same
  // command — an infinite loop. Point it at the plain Next build instead.
  // `--webpack` is required: the Turbopack build doesn't emit the standalone
  // output the adapter bundles.
  buildCommand: "bun run build:next",

  // No `incrementalCache` override: ISR/`use cache` entries live only in the
  // isolate's memory. Wire up the R2 cache when we want them to survive a
  // deploy — that needs an R2 bucket plus the bindings in wrangler.jsonc.
  // See https://opennext.js.org/cloudflare/caching
});
