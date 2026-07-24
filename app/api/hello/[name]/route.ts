import { type NextRequest } from "next/server";

// This file is at app/api/hello/[name]/route.ts
// The [name] folder is a "dynamic segment": it matches any value in that slot.
//   GET /api/hello/milap   -> params.name === "milap"
//   GET /api/hello/world   -> params.name === "world"
//
// Two things that are DIFFERENT from older Next.js (important in v16):
//  1. `params` is a Promise now — you must `await` it.
//  2. The first arg is the incoming request (NextRequest), useful for query
//     strings, headers, cookies, and reading the body.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params; // <-- await, because params is a Promise

  // Query string: /api/hello/milap?loud=true
  const loud = request.nextUrl.searchParams.get("loud") === "true";

  const greeting = `Hello, ${name}!`;
  return Response.json({ message: loud ? greeting.toUpperCase() : greeting });
}

// Example of a second method in the same file: POST /api/hello/<name>
// Reads a JSON body: { "excited": true }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  // request.json() parses the request body. No body-parser config needed
  // (that was a Pages Router thing — gone here).
  let body: { excited?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // Empty or invalid body — return a proper 400 instead of crashing.
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const suffix = body.excited ? "!!!" : ".";
  return Response.json({ message: `Hello, ${name}${suffix}` }, { status: 201 });
}
