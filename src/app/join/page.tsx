"use client";

import { useEffect, useState, type FormEvent } from "react";
import RestaurantWaitDisplay from "@/components/restaurant-wait-display";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Camera,
  MapPin,
  Users,
  UtensilsCrossed,
} from "lucide-react";

type Seating = "any" | "indoor" | "outdoor";

function isValidFullName(value: string) {
  const parts = value.trim().split(/\s+/);
  return parts.length >= 2 &&
    parts.every(part =>
      /^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u.test(part) &&
      [...part].filter(char => /\p{L}/u.test(char)).length >= 2
    );
}

export default function JoinPage() {
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [seatingPreference, setSeatingPreference] = useState<Seating>("any");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [whatsappAvailable, setWhatsappAvailable] = useState(false);
  const [whatsappConfirmation, setWhatsappConfirmation] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/whatsapp/config", { cache: "no-store" }).then(r => r.json())
      .then(data => { if (active) setWhatsappAvailable(data.available === true); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const [qrCode, setQrCode] = useState("");
  const [qrState, setQrState] = useState<"checking" | "valid" | "invalid">("checking");

  useEffect(() => {
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const code = new URLSearchParams(window.location.search).get("code") || "";

    async function checkQR() {
      try {
        // Existing permits survive refreshes, including after QR rotation.
        const permitResponse = await fetch(`/api/qr/permit?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
          credentials: "same-origin",
        });

        const permit = await permitResponse.json();

        if (cancelled) return;

        let valid = permitResponse.ok && permit.valid;
        let expiresAt: number | null = permit.expiresAt ?? null;

        if (!valid && code) {
          const response = await fetch("/api/qr/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ qr_code: code }),
            cache: "no-store",
          });

          const data = await response.json();

          if (cancelled) return;

          valid = response.ok && data.valid;

          if (valid) {
            const statusResponse = await fetch(`/api/qr/permit?code=${encodeURIComponent(code)}`, {
              cache: "no-store",
              credentials: "same-origin",
            });

            const status = await statusResponse.json();

            if (cancelled) return;

            valid = statusResponse.ok && status.valid;
            expiresAt = status.expiresAt ?? null;
          }
        }

        if (!valid) {
          setQrState("invalid");
          return;
        }

        if (expiresAt !== null) {
          const remaining = expiresAt - Date.now();

          if (remaining <= 0) {
            setQrState("invalid");
            return;
          }

          expiryTimer = setTimeout(() => {
            setQrState("invalid");
            setError("Your registration time has expired. Please scan the current QR code.");
          }, remaining);
        }

        setQrState("valid");
      } catch {
        if (!cancelled) setQrState("invalid");
      }
    }

    const initial = window.setTimeout(() => { setQrCode(code); void checkQR(); }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, []);


  async function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setNameTouched(true);
    if (!isValidFullName(name)) {
      setError("Please enter your first and last name.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          party_size: partySize,
          seating_preference: seatingPreference,
          qr_code: qrCode,
          whatsapp_confirmation_consent: whatsappAvailable && whatsappConfirmation,
          whatsapp_feedback_consent: whatsappAvailable && whatsappConfirmation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Unable to join the waitlist."
        );
      }

      const token =
        data.token ||
        data.tracking_token ||
        data.trackingToken;

      const redirect =
        data.status_url ||
        data.tracking_url ||
        data.url ||
        (token ? `/status?token=${encodeURIComponent(token)}` : null);

      if (!redirect) {
        throw new Error(
          "Registration succeeded, but no tracking link was returned. Please ask reception for your booking status."
        );
      }

      const destination = new URL(redirect, window.location.origin);

      if (destination.origin !== window.location.origin) {
        throw new Error("Invalid tracking link returned.");
      }

      window.location.assign(destination.pathname + destination.search);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[#E4DCD0] bg-[#FFFDF9] px-4 py-3.5 text-[15px] text-[#302D28] outline-none transition placeholder:text-[#A69F95] focus:border-[#AD8A5B] focus:ring-2 focus:ring-[#AD8A5B]/15";

  return (
    <main className="min-h-screen bg-[#F4F0E9] text-[#302D28]">
      <div className="mx-auto min-h-screen max-w-[1160px] lg:flex lg:items-center lg:px-6 lg:py-8">
        <div className="grid min-h-screen w-full overflow-hidden bg-[#FFFCF7] shadow-[0_16px_65px_rgba(42,35,25,0.08)] lg:min-h-[750px] lg:grid-cols-[0.9fr_1.1fr] lg:rounded-[28px]">

          {/* Restaurant introduction */}
          <section className="relative flex min-h-[260px] flex-col justify-between overflow-hidden bg-[#34382E] px-7 py-7 text-[#F9F4E9] sm:px-10 lg:min-h-full lg:px-12 lg:py-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-32 -top-24 h-80 w-80 rounded-full border border-[#D7C49E]/15"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-12 h-60 w-60 rounded-full border border-[#D7C49E]/20"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-48 -left-24 h-96 w-96 rounded-full border border-[#D7C49E]/15"
            />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#D9C29C]">
                  <UtensilsCrossed size={15} strokeWidth={1.5} />
                  <span>Mo Bistro</span>
                </div>
                <div className="mt-3 font-serif text-[31px] tracking-[-0.04em] sm:text-[36px]">
                  mo bistro<span className="text-[#D6B681]">.</span>
                </div>
              </div>

              <span className="rounded-full border border-[#D8C9AA]/25 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#E1D5BD]">
                District 5
              </span>
            </div>

            <div className="relative z-10 mt-10 lg:my-auto lg:py-14">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#D6B681]">
                A little time, well spent
              </p>

              <h1 className="max-w-[420px] font-serif text-[43px] leading-[1.08] tracking-[-0.04em] sm:text-[54px] lg:text-[62px]">
                Good things
                <br />
                are worth
                <br />
                <em className="font-normal text-[#D6B681]">waiting for.</em>
              </h1>

              <p className="mt-5 max-w-[330px] text-[14px] leading-7 text-[#E0DDCF]/80">
                We&apos;re happy you&apos;re here. Leave us your details
                and we&apos;ll help you find your place at the table.
              </p>
            </div>

            <div className="relative z-10 mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[#F5EBD5]/15 pt-5 text-[12px] text-[#E0D8C7]">
              <span className="flex items-center gap-2">
                <MapPin size={15} className="text-[#D6B681]" />
                District 5, New Cairo
              </span>
              <a
                href="https://www.instagram.com/mobistroegypt/?hl=en"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 transition hover:text-white"
              >
                <Camera size={15} />
                Follow us
                <ArrowUpRight size={13} />
              </a>
            </div>
          </section>

          {/* Booking form */}
          <section className="flex flex-col justify-center px-6 py-9 sm:px-12 sm:py-12 lg:px-14 xl:px-20">
            <div className="mx-auto w-full max-w-[440px]">
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-2">
                  <span className="h-[1px] w-8 bg-[#B99766]" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#A17E4E]">
                    Welcome to Mo Bistro
                  </span>
                </div>

                <h2 className="font-serif text-[39px] leading-tight tracking-[-0.035em] text-[#2C3028] sm:text-[45px]">
                  {qrState === "valid" ? "Join our waitlist" : "Welcome to Mo Bistro"}
                </h2>
                <p className="mt-3 text-[14px] leading-6 text-[#807B71]">
                  {qrState === "valid"
                    ? "Just a few details and we'll take care of the rest."
                    : "Our waitlist is available through the QR code at reception."}
                </p>
              </div>

              {qrState === "checking" && (
                <p className="text-[#807B71]">Verifying your QR code...</p>
              )}

              {qrState === "invalid" && (
                <div className="rounded-2xl border border-[#E4DCD0] bg-[#FFFDF9] p-6 text-center">
                  <h3 className="font-serif text-2xl text-[#2C3028]">
                    {qrCode ? "Let's try a fresh QR code" : "Your seat is waiting."}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#807B71]">
                    {qrCode
                      ? "This code is no longer active. Please scan the latest QR code at reception."
                      : "To join our waitlist, scan the QR code at reception. We look forward to welcoming you."}
                  </p>
                </div>
              )}

              {qrState === "valid" && (
              <RestaurantWaitDisplay />
              )}

              {qrState === "valid" && (
              <form onSubmit={joinWaitlist} className="space-y-5">
                <div>
                  <label
                    htmlFor="guest-name"
                    className="mb-2 block text-[12px] font-semibold text-[#504B42]"
                  >
                    Your name
                  </label>
                  <input
                    id="guest-name"
                    required
                    autoComplete="name"
                    maxLength={100}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={() => setNameTouched(true)}
                    aria-invalid={nameTouched && !isValidFullName(name)}
                    placeholder="Full name"
                    className={inputClass}
                  />
                  {nameTouched && !isValidFullName(name) && (
                    <p role="alert" className="mt-2 text-sm text-red-600">
                      Please enter your first and last name.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="guest-phone"
                    className="mb-2 block text-[12px] font-semibold text-[#504B42]"
                  >
                    Phone number
                  </label>
                  <input
                    id="guest-phone"
                    required
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="party-size"
                      className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#504B42]"
                    >
                      <Users size={14} />
                      Guests
                    </label>
                    <div className="relative">
                      <select
                        id="party-size"
                        value={partySize}
                        onChange={e => setPartySize(Number(e.target.value))}
                        className={`${inputClass} appearance-none pr-9`}
                      >
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>
                            {n} {n === 1 ? "guest" : "guests"}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#817A6C]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="seating"
                      className="mb-2 block text-[12px] font-semibold text-[#504B42]"
                    >
                      Seating preference
                    </label>
                    <div className="relative">
                      <select
                        id="seating"
                        value={seatingPreference}
                        onChange={e => setSeatingPreference(e.target.value as Seating)}
                        className={`${inputClass} appearance-none pr-9`}
                      >
                        <option value="any">No preference</option>
                        <option value="indoor">Indoor</option>
                        <option value="outdoor">Outdoor</option>
                      </select>
                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#817A6C]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl bg-[#F4F1E9] px-4 py-3.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E2E5D9] text-[#526347]">
                    <Check size={12} />
                  </span>
                  <p className="text-[12px] leading-5 text-[#777367]">
                    We&apos;ll use your details to manage your place in the
                    queue. Seating preferences depend on availability.
                  </p>
                </div>

                {whatsappAvailable && <fieldset className="space-y-3 rounded-xl border border-[#E4DCD0] p-4 text-[13px]">
                  <legend className="px-1 font-semibold">Optional WhatsApp messages</legend>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={whatsappConfirmation} onChange={e => setWhatsappConfirmation(e.target.checked)} />
                    <span>Send me one WhatsApp booking confirmation. If I reply to subscribe, send me queue updates and one review request 60 minutes after seating.</span>
                  </label>
                  <p className="text-xs text-[#777367]">Booking is available without these options. To unsubscribe at any time, reply UNSUBSCRIBE or STOP on WhatsApp.</p>
                </fieldset>}

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl bg-[#34382E] px-5 py-4 text-[14px] font-semibold text-[#FFF9EC] transition hover:bg-[#4C523F] disabled:cursor-wait disabled:opacity-60"
                >
                  {loading ? "Joining the waitlist..." : "Join the waitlist"}
                  {!loading && (
                    <ArrowRight
                      size={17}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  )}
                </button>
              </form>
              )}

              <div className="mt-7 text-center">
                <a
                  href="/lookup"
                  className="text-[13px] text-[#9A794E] underline decoration-[#C8B393] underline-offset-4 hover:text-[#5E4A31]"
                >
                  Already registered? Find your booking
                </a>
              </div>

              <div className="mt-9 flex items-center justify-center gap-5 border-t border-[#EAE4DA] pt-6 text-[12px] text-[#777064]">
                <a
                  href="https://www.elmenus.com/cairo/mo-bistro-2z83"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-[#A17E4E]"
                >
                  Explore the menu <ArrowUpRight size={13} />
                </a>
                <span className="h-1 w-1 rounded-full bg-[#C8BBA9]" />
                <a
                  href="https://www.facebook.com/mobistroegypt/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-[#A17E4E]"
                >
                  Facebook <ArrowUpRight size={13} />
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
