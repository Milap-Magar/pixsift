"use client";

// The dashboard's navigation rail.
//
// A Client Component only because it reads `usePathname()` to mark the current
// section — everything it renders is otherwise static. The pages it links to
// stay Server Components, so none of the actual dashboard content is affected.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Copy,
  Heart,
  Home,
  ImagePlus,
  LayoutGrid,
  Palette,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

export default function DashboardSidebar({
  counts,
}: {
  counts: { mine: number; saved: number; duplicates: number };
}) {
  const pathname = usePathname();

  const board: Item[] = [
    { href: "/dashboard", label: "Overview", icon: Home },
    { href: "/dashboard/pins", label: "My pins", icon: Sparkles, badge: counts.mine },
    { href: "/dashboard/saved", label: "Favourites", icon: Heart, badge: counts.saved },
  ];

  const algorithms: Item[] = [
    { href: "/colors", label: "Browse by colour", icon: Palette },
    {
      href: "/dashboard/duplicates",
      label: "Duplicates",
      icon: Copy,
      badge: counts.duplicates,
    },
  ];

  const explore: Item[] = [
    { href: "/", label: "Feed", icon: LayoutGrid },
    { href: "/discover", label: "Discover", icon: Search },
    { href: "/most-popular", label: "Most popular", icon: TrendingUp },
  ];

  /**
   * Exact match for the dashboard root, prefix match for everything below it.
   * A plain `startsWith` would light up "Overview" on every dashboard page,
   * since every one of their paths begins with `/dashboard`.
   */
  const isActive = (href: string) =>
    href === "/dashboard" || href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="h-8 w-auto shrink-0" />
          <span className="truncate font-heading text-lg group-data-[collapsible=icon]:hidden">
            PixSift
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <Section label="Your board" items={board} isActive={isActive} />
        {/* Named for what they DO, not for the algorithm behind them. "Browse
            by colour" is the promise; k-means is the implementation detail, and
            it's the pin's own page that explains it. */}
        <Section label="Find things" items={algorithms} isActive={isActive} />
        <Section label="Explore" items={explore} isActive={isActive} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link href="/dashboard/pins">
                  <ImagePlus />
                  <span>Add a photo</span>
                </Link>
              }
              tooltip="Add a photo"
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function Section({
  label,
  items,
  isActive,
}: {
  label: string;
  items: Item[];
  isActive: (href: string) => boolean;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, label: itemLabel, icon: Icon, badge }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                isActive={isActive(href)}
                tooltip={itemLabel}
                render={
                  <Link href={href}>
                    <Icon />
                    <span>{itemLabel}</span>
                  </Link>
                }
              />
              {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
