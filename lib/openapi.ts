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
      "The PixSift HTTP API. Every endpoint is a Next.js 16 Route Handler " +
      "(app/**/route.ts). Use 'Try it out' to call them live.\n\n" +
      "Pins carry a 64-bit perceptual hash and a k-means colour palette, " +
      "computed on upload — see docs/algorithms/.",
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
    "/api/pins": {
      get: {
        tags: ["Pins"],
        summary: "List public pins",
        description:
          "Anyone can view pins. No authentication required — and PUBLIC pins " +
          "only, even with a session, because this response is cacheable. Your " +
          "own private pins are on /dashboard and /profile.",
        parameters: [
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Opaque cursor from a previous page's `nextCursor`.",
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 24, maximum: 100 },
          },
          {
            name: "author",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Only this author's public pins.",
          },
        ],
        responses: {
          "200": {
            description: "One page of pins, newest first",
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
                          visibility: { type: "string", enum: ["public", "private"] },
                        },
                      },
                    },
                    nextCursor: {
                      type: "string",
                      nullable: true,
                      description: "Pass as `cursor` for the next page. `null` at the end.",
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
                  description: { type: "string" },
                  visibility: {
                    type: "string",
                    enum: ["public", "private"],
                    default: "public",
                    description:
                      "`private` keeps the pin out of the feed, search and " +
                      "recommendations — only its author can see it.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Pin created" },
          "400": { description: "Missing title, or imageUrl isn't an http(s) URL" },
          "401": { description: "Not signed in" },
        },
      },
    },
    "/api/pins/{id}/download": {
      get: {
        tags: ["Pins", "Downloads"],
        summary: "Download a pin's image",
        description:
          "Streams the image with `Content-Disposition: attachment`, which is " +
          "what actually makes a browser save it — the HTML `download` " +
          "attribute is ignored cross-origin. Viewer-aware: a private pin is " +
          "downloadable by its author and 404s for everyone else.\n\n" +
          "For Cloudinary-hosted pins the size is applied as an edge " +
          "transformation, so resizing costs us no image processing. Sizes at " +
          "or above the original's width are clamped to the original, and the " +
          "filename reflects what was actually delivered.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "size",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["small", "medium", "large", "original"],
              default: "original",
            },
            description: "small=640px, medium=1280px, large=2048px, original=untouched.",
          },
        ],
        responses: {
          "200": { description: "The image bytes, as an attachment" },
          "404": { description: "No such pin, or not yours to see" },
          "415": { description: "The stored URL isn't an image" },
          "502": { description: "The image host was unreachable" },
        },
      },
    },
    "/api/photos/{id}/download": {
      get: {
        tags: ["Discover", "Downloads"],
        summary: "Download a discovered (Pixabay) photo",
        description:
          "For images nobody has saved yet, so there is no pin id to ask for.\n\n" +
          "Takes a Pixabay IMAGE ID and resolves it through their API — " +
          "deliberately NOT a URL. A route that fetched any URL a caller " +
          "handed it would be an open proxy, usable to reach addresses only " +
          "this server can see. The photographer's name is written into the " +
          "filename so the credit survives leaving the site.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Pixabay image id (digits only).",
          },
          {
            name: "size",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["small", "medium", "large", "original"],
              default: "original",
            },
            description:
              "Pixabay publishes two fixed renditions, so small/medium map to " +
              "the ~640px version and large/original to the full-size file.",
          },
        ],
        responses: {
          "200": { description: "The image bytes, as an attachment" },
          "404": { description: "No such photo" },
          "503": { description: "Photo search isn't configured" },
        },
      },
    },
    "/api/feed": {
      get: {
        tags: ["Pins"],
        summary: "The home feed",
        description:
          "Public pins first, then Pixabay results, behind a single opaque " +
          "cursor — see docs/INFINITE-SCROLL.md.",
        parameters: [
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 24 } },
        ],
        responses: { "200": { description: "One page of feed items" } },
      },
    },
    "/api/search": {
      get: {
        tags: ["Discover"],
        summary: "Search Pixabay",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
        ],
        responses: {
          "200": { description: "Search results" },
          "503": { description: "PIXABAY_API_KEY isn't set" },
        },
      },
    },
    "/api/favorites": {
      get: {
        tags: ["Favourites"],
        summary: "Your saved pin ids (requires login)",
        responses: {
          "200": { description: "The signed-in user's favourite pin ids" },
          "401": { description: "Not signed in" },
        },
      },
    },
    "/api/dashboard": {
      post: {
        tags: ["Discover"],
        summary: "Save a discovered image to your board (requires login)",
        description:
          "Writes one pin from a Pixabay result. The bytes stay on Pixabay's " +
          "servers; we store the link and the provenance. The perceptual hash " +
          "and colour palette are computed AFTER the response is sent.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "imageUrl"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  imageUrl: { type: "string" },
                  thumbUrl: { type: "string" },
                  provider: { type: "string", enum: ["pixabay"] },
                  providerId: { type: "string" },
                  providerPageUrl: { type: "string" },
                  credit: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  visibility: { type: "string", enum: ["public", "private"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Pin created" },
          "401": { description: "Not signed in" },
          "409": { description: "You've already saved that image" },
        },
      },
    },
    "/api/pins/{id}/comments": {
      get: {
        tags: ["Comments"],
        summary: "Comments on a pin",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "The thread" } },
      },
      post: {
        tags: ["Comments"],
        summary: "Add a comment (requires login)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: { body: { type: "string", maxLength: 1000 } },
              },
            },
          },
        },
        responses: {
          "201": { description: "Comment added" },
          "401": { description: "Not signed in" },
        },
      },
    },
    "/api/pins/{id}/comments/stream": {
      get: {
        tags: ["Comments"],
        summary: "Live comment stream (Server-Sent Events)",
        description:
          "text/event-stream. New comments are pushed as they arrive. The " +
          "emitter is in-process, so this only works on a single instance — " +
          "see docs/ROADMAP.md.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "An open SSE stream" } },
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
