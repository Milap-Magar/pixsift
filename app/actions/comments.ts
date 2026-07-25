"use server";

// Comment Server Actions.
//
// Posting a comment is the one thing on the details page that requires an
// account, so this is where that rule actually lives — the composer swapping
// itself for a login button is only the polite version of it.
//
// Note there's no revalidatePath here: the comment reaches every open thread
// through the SSE stream instead, which is both faster and doesn't blow away
// what anyone else was typing.

import { addComment, MAX_COMMENT_LENGTH, type Comment } from "@/lib/comments";
import { getPin } from "@/lib/pins";
import { currentUser } from "@/lib/session";

export type AddCommentResult = {
  comment?: Comment;
  error?: string;
};

export async function addCommentAction(
  pinId: string,
  body: string,
): Promise<AddCommentResult> {
  const user = await currentUser();
  if (!user) return { error: "Sign in to join the conversation." };

  if (!getPin(pinId)) return { error: "That pin no longer exists." };

  const trimmed = body.trim();
  if (!trimmed) return { error: "Write something first." };
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return { error: `Comments are capped at ${MAX_COMMENT_LENGTH} characters.` };
  }

  const comment = addComment({
    pinId,
    body: trimmed,
    author: user.name,
    authorId: user.id,
    authorImage: user.image,
  });

  return { comment };
}
