// Server-Sent Events: the live half of the comment thread.
//
// SSE rather than WebSockets because this traffic only ever flows one way
// (server -> viewer) and it needs no extra server, no new dependency, and
// reconnects on its own via the browser's EventSource.
//
// Reading the stream is PUBLIC — anyone looking at the pin sees new comments
// appear. Writing one is not; that goes through addCommentAction, which checks
// the session.

import { subscribe, type Comment } from "@/lib/comments";
import { getPin } from "@/lib/pins";

// Never cache or pre-render a stream.
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request, ctx: RouteContext<"/api/pins/[id]/comments/stream">) {
  const { id } = await ctx.params;

  if (!getPin(id)) {
    return Response.json({ error: "No such pin." }, { status: 404 });
  }

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const shutdown = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing to do.
        }
      };

      const send = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          shutdown();
        }
      };

      // Tell the client we're live, so it can show a "live" indicator.
      send(sse("ready", { pinId: id }));

      unsubscribe = subscribe(id, (comment: Comment) => send(sse("comment", comment)));

      // A comment-only line every 25s. Proxies love to kill idle connections,
      // and this is cheap enough to keep them from doing it.
      heartbeat = setInterval(() => send(encoder.encode(": keep-alive\n\n")), 25_000);

      // The browser navigating away / closing the tab aborts the request.
      request.signal.addEventListener("abort", shutdown);
    },

    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx and friends from buffering the stream into uselessness.
      "X-Accel-Buffering": "no",
    },
  });
}
