// Verifies your Cloudinary credentials and tells you exactly which one is wrong.
//
//   bun run cloudinary:check
//
// Never prints the secret — only whether it's set and how long it is.

import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_SECRET ?? process.env.CLOUDINARY_API_SECRET;

console.log("Cloudinary configuration");
console.log("────────────────────────");
console.log(`  CLOUDINARY_CLOUD_NAME  ${cloudName ?? "(missing)"}`);
console.log(`  CLOUDINARY_API_KEY     ${apiKey ? `set (${apiKey.length} chars)` : "(missing)"}`);
console.log(`  CLOUDINARY_SECRET      ${apiSecret ? `set (${apiSecret.length} chars)` : "(missing)"}`);
console.log("");

if (!cloudName || !apiKey || !apiSecret) {
  console.log("✗ Missing values. All three are on the Cloudinary dashboard under");
  console.log("  Settings → API Keys, in the 'Product Environment Credentials' panel.");
  process.exit(1);
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

try {
  await cloudinary.api.ping();
  console.log("✓ Authenticated.");

  const usage = await cloudinary.api.usage();
  console.log(`  plan:     ${usage.plan}`);
  console.log(`  storage:  ${usage.storage?.usage ?? "?"} bytes`);

  const existing = await cloudinary.api.resources_by_tag("pixsift-seed", { max_results: 100 });
  const seededCount: number = existing.resources?.length ?? 0;
  console.log(`  seeded:   ${seededCount} image(s) tagged 'pixsift-seed'`);

  if (seededCount === 0) {
    console.log("\n  Next: bun run seed  — uploads the starter gallery.");
  }
} catch (error: unknown) {
  const e = error as { error?: { message?: string }; message?: string; http_code?: number };
  const message = e.error?.message ?? e.message ?? "unknown error";

  console.log(`✗ ${message}`);
  console.log("");

  if (message.includes("cloud_name mismatch")) {
    console.log("  Your API key/secret are valid, but they don't belong to the cloud named");
    console.log(`  '${cloudName}'. That's almost always a copy-paste slip.`);
    console.log("");
    console.log("  Fix: open https://console.cloudinary.com/settings/api-keys and copy the");
    console.log("  'Cloud name' from the SAME panel you copied the key and secret from.");
    console.log("  It usually looks like 'dxa1b2c3d' or a name you chose at signup —");
    console.log("  it is not your username, folder, or environment label.");
  } else if (message.toLowerCase().includes("signature") || e.http_code === 401) {
    console.log("  The cloud name is fine but the key/secret pair was rejected.");
    console.log("  Re-copy CLOUDINARY_API_KEY and CLOUDINARY_SECRET from the dashboard.");
  }

  process.exit(1);
}
