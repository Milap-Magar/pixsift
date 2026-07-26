"use client";

// A CLIENT Component ("use client") because it uses browser state (useState)
// and does a fetch() in response to a click. This is the "frontend calling
// your API" half of the picture:
//   - it POSTs JSON to /api/pins
//   - if the API returns 401, we send the user to /login
//   - on success (201) we go back to the homepage to see the new pin

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_VISIBILITY, VISIBILITIES, type Visibility } from "@/lib/visibility";

export default function AddPinForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, imageUrl, visibility }),
    });

    setSubmitting(false);

    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    // Success: go home. router.refresh() re-fetches the server component so the
    // new pin shows up immediately.
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="A calm sunset"
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Image URL</span>
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          required
          placeholder="https://picsum.photos/seed/anything/500/700"
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Who can see it</span>
        {/* A plain <select>: same value the API expects, no extra components.
            The server calls parseVisibility() on it either way — anything it
            doesn't recognise becomes "public". */}
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
        >
          {VISIBILITIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.hint}
            </option>
          ))}
        </select>
      </label>

      {imageUrl && (
        // Live preview of what will be pinned.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="max-h-64 rounded-lg object-cover" />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-red-600 px-5 py-2.5 font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add pin"}
      </button>
    </form>
  );
}
