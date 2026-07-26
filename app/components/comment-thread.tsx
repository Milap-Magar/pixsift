"use client";

// The comment thread, live for everyone looking at the pin.
//
// Two sources feed the same list:
//   - the server-rendered `initialComments`, so the thread is complete on first
//     paint (and readable with JS disabled)
//   - an EventSource on /api/pins/:id/comments/stream, which appends anything
//     posted from any other browser
//
// Your own comment arrives twice — once as the action's return value (instant)
// and once back down the stream — so every insert is de-duplicated by id.
//
// Posting requires an account. Signed out, the composer is replaced by a login
// trigger: one click, one Google prompt, straight back here.

import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircle, MessageCircle, Send } from "lucide-react";

import { addCommentAction } from "@/app/actions/comments";
import type { Comment } from "@/lib/comments";
import { MAX_COMMENT_LENGTH } from "@/lib/comments";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

import LoginDialog from "./login-dialog";

type CommentThreadProps = {
  pinId: string;
  initialComments: Comment[];
  signedIn: boolean;
  /** So we can label the poster's own comments. */
  currentUserId?: string;
  /** Where to come back to after signing in. */
  returnTo: string;
};

export default function CommentThread({
  pinId,
  initialComments,
  signedIn,
  currentUserId,
  returnTo,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [live, setLive] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);

  // Subscribing to an external system is exactly what an effect is for.
  useEffect(() => {
    const source = new EventSource(`/api/pins/${encodeURIComponent(pinId)}/comments/stream`);

    source.addEventListener("ready", () => setLive(true));

    source.addEventListener("comment", (event) => {
      const incoming = JSON.parse((event as MessageEvent).data) as Comment;
      setComments((current) =>
        current.some((c) => c.id === incoming.id) ? current : [...current, incoming],
      );
    });

    // EventSource reconnects on its own; we just stop claiming to be live.
    source.onerror = () => setLive(false);

    return () => source.close();
  }, [pinId]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await addCommentAction(pinId, body);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.comment) {
        const posted = result.comment;
        setComments((current) =>
          current.some((c) => c.id === posted.id) ? current : [...current, posted],
        );
        setDraft("");
        // Scroll the list itself rather than a sentinel element. A <div> inside
        // a <ul> is invalid — the parser can move it, which desyncs hydration.
        const list = listRef.current;
        if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <MessageCircle className="size-4 text-muted-foreground" />
        <h2 className="font-medium">
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </h2>
        <span
          title={live ? "Live — new comments appear instantly" : "Reconnecting…"}
          className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              live ? "animate-pulse bg-emerald-500" : "bg-zinc-400",
            )}
          />
          {live ? "Live" : "Offline"}
        </span>
      </header>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
      ) : (
        <ul ref={listRef} className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              {comment.authorImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={comment.authorImage}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-full"
                />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
                  {comment.author.slice(0, 1).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">{comment.author}</span>
                  {comment.authorId === currentUserId && (
                    <span className="text-xs text-muted-foreground">you</span>
                  )}
                  {/* Relative time depends on "now", which differs between the
                      server render and the browser — hence the suppression. */}
                  <time
                    dateTime={new Date(comment.createdAt).toISOString()}
                    suppressHydrationWarning
                    className="text-xs text-muted-foreground"
                  >
                    {timeAgo(comment.createdAt)}
                  </time>
                </p>
                <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {signedIn ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter makes a new line.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit(event);
                }
              }}
              rows={2}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder="Add a comment…"
              className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              aria-label="Post comment"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-red-600 text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      ) : (
        <LoginDialog
          redirectTo={returnTo}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition hover:border-ring/60 hover:bg-muted/40 hover:text-foreground"
        >
          <MessageCircle className="size-4" />
          Sign in to comment — takes one click
        </LoginDialog>
      )}
    </section>
  );
}
