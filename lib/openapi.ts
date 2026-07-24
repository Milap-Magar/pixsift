// ── The OpenAPI spec: the single source of truth for your API docs ──────────
//
// "Swagger" = an interactive viewer. What it VIEWS is an "OpenAPI" document:
// a JSON object that describes every endpoint — its path, method, parameters,
// request body, and responses. You maintain THIS object; Swagger UI renders it.
//
// To document a new endpoint later, you just add another entry under `paths`.
// (There are libraries that auto-generate this from code comments, but writing
// it by hand first is the best way to understand what a spec actually is.)

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "PixSift API",
    version: "0.1.0",
    description:
      "Learning API for PixSift. Endpoints are Next.js 16 Route Handlers " +
      "(app/**/route.ts). Use the 'Try it out' button below to call them live.",
  },
  servers: [{ url: "/", description: "This server" }],
  paths: {
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        description: "Returns a simple status object. Good for uptime probes.",
        responses: {
          "200": {
            description: "Service is up",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    service: { type: "string", example: "pixsift-app" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/hello/{name}": {
      get: {
        tags: ["Examples"],
        summary: "Greet a name",
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            description: "Who to greet",
            schema: { type: "string" },
            example: "milap",
          },
          {
            name: "loud",
            in: "query",
            required: false,
            description: "If true, SHOUT the greeting",
            schema: { type: "boolean" },
          },
        ],
        responses: {
          "200": {
            description: "The greeting",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Examples"],
        summary: "Greet a name with a JSON body",
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "milap",
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  excited: {
                    type: "boolean",
                    description: "Add exclamation marks",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created greeting",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { message: { type: "string" } },
                },
              },
            },
          },
          "400": { description: "Body was not valid JSON" },
        },
      },
    },
    "/api/pins": {
      get: {
        tags: ["Pins"],
        summary: "List all pins (public)",
        description: "Anyone can view pins. No authentication required.",
        responses: {
          "200": {
            description: "The pins",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pins: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          imageUrl: { type: "string" },
                          author: { type: "string" },
                          createdAt: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Pins"],
        summary: "Add a pin (requires login)",
        description:
          "Creates a pin. Requires a valid Auth.js session cookie — returns " +
          "401 if you are not signed in.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "imageUrl"],
                properties: {
                  title: { type: "string", example: "A calm sunset" },
                  imageUrl: {
                    type: "string",
                    example: "https://picsum.photos/seed/sunset/500/700",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Pin created" },
          "400": { description: "Missing title or imageUrl" },
          "401": { description: "Not signed in" },
        },
      },
    },
    "/api/auth/session": {
      get: {
        tags: ["Auth"],
        summary: "Current session (Auth.js)",
        description:
          "Returns the logged-in user's session, or an empty object if not " +
          "signed in. Managed automatically by Auth.js — not hand-written.",
        responses: { "200": { description: "Session object (may be empty)" } },
      },
    },
  },
} as const;
