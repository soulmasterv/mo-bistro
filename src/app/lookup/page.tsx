"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Search,
  ArrowLeft,
  Users,
  MapPin,
  Clock3,
} from "lucide-react";

type Booking = {
  id: number;
  name: string;
  party_size: number;
  status: string;
  seating_preference: string | null;
  created_at: string;
  queue_position: number | null;
};

export default function LookupPage() {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setSearched(false);
    setBookings([]);

    try {
      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Lookup failed.");
      }

      setBookings(result.bookings ?? []);
      setSearched(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Lookup failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE] px-5 py-10 text-[#242424]">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <Link
          href="/join"
          className="mb-7 inline-flex items-center gap-2 text-sm text-[#A78A60]"
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <Search size={32} className="mb-4 text-[#A78A60]" />

        <h1 className="text-2xl font-semibold">
          Find my booking
        </h1>

        <p className="mt-2 text-sm text-[#77716A]">
          Enter the name or mobile number used to register.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Name or 01xxxxxxxxx"
            required
            minLength={2}
            maxLength={100}
            className="w-full rounded-xl border border-[#DDD5C9] p-4 outline-none focus:border-[#A78A60]"
          />

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#242424] p-4 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Searching..." : "Find my booking"}
          </button>
        </form>

        {searched && bookings.length === 0 && (
          <div className="mt-6 rounded-xl bg-[#F7F4EE] p-5 text-center">
            <p className="font-medium">No active booking found</p>
            <p className="mt-2 text-sm text-[#77716A]">
              Check the spelling or phone number and try again.
            </p>
          </div>
        )}

        {bookings.length > 0 && (
          <section className="mt-7 space-y-3">
            <h2 className="text-sm font-semibold text-[#77716A]">
              {bookings.length} matching booking
              {bookings.length !== 1 ? "s" : ""}
            </h2>

            {bookings.map(booking => (
              <article
                key={booking.id}
                className="rounded-2xl border border-[#E8E0D4] bg-[#FFFCF7] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">
                    {booking.name}
                  </h3>

                  <span className="rounded-full bg-[#E8EDE3] px-3 py-1 text-xs font-medium capitalize text-[#48613F]">
                    {booking.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[#77716A]">
                  <span className="flex items-center gap-2">
                    <Users size={15} />
                    {booking.party_size} guests
                  </span>

                  <span className="flex items-center gap-2 capitalize">
                    <MapPin size={15} />
                    {booking.seating_preference || "Any seating"}
                  </span>

                  {booking.queue_position !== null && (
                    <span className="flex items-center gap-2">
                      <Clock3 size={15} />
                      Queue #{booking.queue_position}
                    </span>
                  )}
                </div>

                <p className="mt-4 text-xs text-[#948A7D]">
                  Booking #{booking.id}
                </p>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
