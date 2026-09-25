// OpenNext adapter config for Cloudflare Workers.
//
// `wrangler deploy` expects `.open-next/worker.js`, which only exists after
// `opennextjs-cloudflare build` has run. That command builds the Next app
// itself (in standalone mode) and then bundles the output for workerd — so the
// Cloudflare build step has to call it, not `next build` directly.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  // `defineCloudflareConfig()` only returns the Cloudflare-specific slice of
  // the OpenNext config — it destructures its argument and drops anything it
  // doesn't recognise, `buildCommand` included. So top-level OpenNext options
  // have to be spread in alongside it, NOT passed to it.
  ...defineCloudflareConfig({
    // No `incrementalCache` override: ISR/`use cache` entries live only in the
    // isolate's memory. Wire up the R2 cache when we want them to survive a
    // deploy — that needs an R2 bucket plus the bindings in wrangler.jsonc.
    // See https://opennext.js.org/cloudflare/caching
  }),

  // Without this the adapter defaults to `<packager> run build`, i.e.
  // `bun run build` — which is `opennextjs-cloudflare build`, this very
  // command. That recurses forever: the build never fails, it just spawns a
  // fresh nested build every ~2s until the CI job is killed.
  // `--webpack` is required: the Turbopack build doesn't emit the standalone
  // output the adapter bundles.
  buildCommand: "bun run build:next",
};
