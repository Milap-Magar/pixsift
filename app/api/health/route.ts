// A Route Handler = a file named `route.ts` inside `app/`.
// The URL is the folder path: this file lives at app/api/health/route.ts,
// so it answers requests to  GET /api/health
//
// You export one async function PER HTTP method you want to support.
// Next.js calls the export whose name matches the request method.

export async function GET() {
  // `Response.json(...)` is a Web-standard helper (not a Next-only API).
  // It sets Content-Type: application/json and serializes the object for you.
  return Response.json({
    status: "ok",
    service: "pixsift-app",
    // NOTE: real request-time values (Date.now(), headers, db) make the
    // handler "dynamic" — see the caching notes in the chat message.
  });
}
