export type GuestStatus = "waiting" | "called" | "seated" | "no_show" | "cancelled";
export type GuestAction = "call" | "seat" | "no_show" | "cancel" | "confirm";
export type QueueFilter = "all" | "waiting" | "seated";

export type ReceptionGuest = {
  id: number;
  name: string;
  phone: string;
  party_size: number;
  seating_preference: "indoor" | "outdoor" | "any";
  status: GuestStatus;
  confirmed: number;
  confirmation_required?: boolean;
  source: string;
  created_at: string;
  called_at?: string | null;
  eta_at?: string | null;
  fits_available?: boolean;
};

export const guestStatusLabels: Record<GuestStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  seated: "Seated",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export function elapsedWait(guest: Pick<ReceptionGuest, "status" | "created_at">, clock: number) {
  if (guest.status === "seated") return "—";
  const joined = new Date(guest.created_at).getTime();
  if (!clock || !Number.isFinite(joined)) return "—";
  const minutes = Math.max(0, Math.floor((clock - joined) / 60000));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes} min`;
}

// Positions follow the full arrival order, independently of the current search.
// Called guests remain in the active queue until seated or removed.
export function deriveReceptionQueue(guests: ReceptionGuest[], search: string, filter: QueueFilter) {
  const active: ReceptionGuest[] = [];
  const queueGuests: ReceptionGuest[] = [];
  const positions = new Map<number, number>();
  let waiting = 0;
  let seated = 0;

  for (const guest of guests) {
    if (guest.status === "waiting" || guest.status === "called") {
      active.push(guest);
      positions.set(guest.id, active.length);
      if (guest.status === "waiting") waiting++;
    } else if (guest.status === "seated") {
      positions.set(guest.id, ++seated);
    } else {
      continue;
    }
    queueGuests.push(guest);
  }

  const query = search.toLowerCase();
  const filtered = queueGuests.filter(guest =>
    `${guest.name} ${guest.phone}`.toLowerCase().includes(query) &&
    (filter === "all"
      ? guest.status === "waiting" || guest.status === "called"
      : guest.status === filter),
  );

  return { active, queueGuests, filtered, positions, waiting, seated };
}
