// A profile picture that always renders something.
//
// This exists because of a real bug: the header used to be
//   <Link href="/profile">{user.image && <img …/>}</Link>
// so for any account without a Google photo the link collapsed to a 0×0 box —
// the profile page was unreachable, and looked like it didn't exist. Falling
// back to the initial means there is always something to click.

import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  image?: string | null;
  /** Rendered size in pixels. */
  size?: number;
  className?: string;
};

export default function UserAvatar({ name, image, size = 32, className }: UserAvatarProps) {
  const classes = cn(
    "shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/15",
    className,
  );

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={classes}
      />
    );
  }

  return (
    <span
      aria-label={name}
      title={name}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.4)) }}
      className={cn(classes, "grid place-items-center bg-muted font-medium text-foreground")}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
