// THE ADD PAGE ("/add") — protected. Two layers of protection here:
//   1. This Server Component checks the session and redirects to /login if the
//      visitor isn't signed in — so the form is never even shown to guests.
//   2. The /api/pins POST it submits to ALSO checks auth (defense in depth).

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/app/components/site-header";
import AddPinForm from "./add-pin-form";

export default async function AddPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 p-6">
        <h1 className="mb-6 text-2xl font-semibold">Add a pin</h1>
        <AddPinForm />
      </main>
    </div>
  );
}
