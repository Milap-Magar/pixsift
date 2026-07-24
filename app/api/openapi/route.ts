// Serves the raw OpenAPI JSON at  GET /api/openapi
// The Swagger UI page (/docs) fetches this and renders it.
// Any other tool (Postman, an SDK generator, etc.) can consume it too.

import { openApiSpec } from "@/lib/openapi";

export async function GET() {
  return Response.json(openApiSpec);
}
