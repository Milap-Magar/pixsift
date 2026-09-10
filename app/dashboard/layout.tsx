// THE DASHBOARD SHELL — the frame every /dashboard/* page renders inside.
//
// Protected here, once, rather than in each page: a layout runs before the page
// it wraps, so a guest is redirected before any child even starts rendering.
// That is a convenience, NOT the security boundary — every mutation these pages
// can trigger re-checks the session server-side (see app/actions/pins.ts), and
// every read is scoped by `viewerId` in the query itself. Hiding a page is a
// courtesy; the checks behind it are the rule.
//
// ── Why a sidebar here and a top bar everywhere else ──────────────────────
// The public pages are a gallery: one column of content, the header out of the
// way, the photographs doing the work. The dashboard is a workspace with half a
// dozen destinations you move between repeatedly, and a rail keeps all of them
// one click away without spending vertical space. Different job, different
// furniture.

import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clusterDuplicates, DUPLICATE_THRESHOLD } from "@/lib/algorithms/hamming";
import { listPinHashes } from "@/lib/db/pins";
import { getFavoriteIds } from "@/lib/pins";
import { countPins } from "@/lib/db/pins";
import { currentUser } from "@/lib/session";

import DashboardSidebar from "./dashboard-sidebar";
import DashboardUser from "./dashboard-user";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Only the three numbers the rail's badges need. The pages fetch their own
  // data; duplicating those reads here to decorate a nav would double every
  // query on every dashboard page for three integers.
  const [mine, hashes] = await Promise.all([
    countPins(user.id),
    listPinHashes({ viewerId: user.id }),
  ]);

  const duplicates = clusterDuplicates(hashes, DUPLICATE_THRESHOLD);

  return (
    // TooltipProvider is required by SidebarMenuButton's `tooltip` prop, which
    // is what labels the rail once it collapses to icons.
    <TooltipProvider>
      <SidebarProvider>
        <DashboardSidebar
          counts={{
            mine,
            saved: getFavoriteIds(user.id).size,
            // Groups, not pins: "4" should mean four things to review, not
            // eight photographs that make up four pairs.
            duplicates: duplicates.length,
          }}
        />

        <SidebarInset className="bg-zinc-50 dark:bg-black">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-black/5 bg-background/80 px-4 backdrop-blur dark:border-white/10">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <DashboardUser name={user.name} image={user.image} />
          </header>

          <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
