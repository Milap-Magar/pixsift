// The signed-in identity in the dashboard header: avatar, name, and the way out.
//
// Sign-out is a <form> posting to a Server Function rather than an onClick.
// That's what makes it work before hydration and without JavaScript, and it
// means the session is cleared by the server rather than by the client asking
// nicely.

import Link from "next/link";

import UserAvatar from "@/app/components/user-avatar";
import { signOutAction } from "@/app/actions/auth";

export default function DashboardUser({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  return (
    <div className="ml-auto flex items-center gap-3">
      <Link
        href="/profile"
        className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition hover:bg-muted"
      >
        <UserAvatar name={name} image={image} size={28} />
        <span className="hidden text-sm font-medium sm:inline">{name.split(" ")[0]}</span>
      </Link>

      <form action={signOutAction}>
        <button className="cursor-pointer text-sm text-muted-foreground transition hover:text-foreground hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
