// This is a CATCH-ALL Route Handler.
//
// The folder name [...nextauth] means "match /api/auth/ + anything after it":
//   /api/auth/signin
//   /api/auth/callback/google   <-- Google redirects the user back to here
//   /api/auth/session
//   /api/auth/signout
//   ...and more
//
// Auth.js implements ALL of those endpoints for us. We just have to expose its
// GET and POST handlers at this route. That's the whole file — no logic here.
//
// (Compare this to your old empty `app/pages/api/auth/[...nextauth].ts` stub:
//  same idea, but the working location is app/api/.../route.ts with `handlers`.)

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
