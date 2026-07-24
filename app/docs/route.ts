// Serves the interactive Swagger UI at  GET /docs
//
// Instead of installing a heavy React package (which fights with React 19 /
// Next 16), we return a tiny standalone HTML page that loads Swagger UI from a
// CDN and points it at our /api/openapi spec. Open http://localhost:3000/docs
// in a browser to get the classic "Swagger" experience with a "Try it out"
// button on every endpoint.

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PixSift API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/api/openapi",       // <-- our spec, served by app/api/openapi/route.ts
          dom_id: "#swagger-ui",
          deepLinking: true,
        });
      };
    </script>
  </body>
</html>`;

export async function GET() {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
