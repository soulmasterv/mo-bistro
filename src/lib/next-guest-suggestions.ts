import "server-only";
import { getPostgres } from "@/lib/postgres-db";
type Candidate = {
  id: number;
  name: string;
  party_size: number;
  seating_preference: string;
};
type Area = { area: string; seats: number };
export function chooseDistinctGuests(
  areas: Area[],
  guests: Candidate[],
  override: boolean,
) {
  const used = new Set<number>();
  return areas.map((area) => {
    const guest =
      area.seats > 0
        ? guests.find(
            (g) =>
              !used.has(g.id) &&
              g.party_size <= area.seats &&
              (override ||
                g.seating_preference === "any" ||
                g.seating_preference === area.area),
          )
        : undefined;
    if (guest) used.add(guest.id);
    return { area: area.area, available: area.seats > 0, guest: guest ?? null };
  });
}
export async function nextGuestsByArea() {
  return getPostgres().begin(async (tx) => {
    await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    const settings =
      await tx`SELECT key,value FROM seating_settings WHERE key IN ('table_view_mode','allow_area_override')`;
    const simple = settings.some(
      (r) => r.key === "table_view_mode" && r.value === "simple",
    );
    const override =
      (settings.find((r) => r.key === "allow_area_override")?.value ??
        "true") === "true";
    let available: { area: string; seats: number }[] = [];
    if (simple) {
      const named =
        await tx`SELECT id FROM restaurant_tables WHERE status='occupied' LIMIT 1`;
      if (!named.length)
        available =
          await tx`SELECT area,max_party_size AS seats FROM simple_table_capacity WHERE total_tables>occupied_tables`;
    } else
      available =
        await tx`SELECT area,MAX(seats) AS seats FROM restaurant_tables WHERE status='free' GROUP BY area`;
    const areas = ["indoor", "outdoor"].map((area) => ({
      area,
      seats: Number(available.find((a) => a.area === area)?.seats ?? 0),
    }));
    const guests = await tx<
      Candidate[]
    >`SELECT id,name,party_size,seating_preference FROM guests WHERE status IN ('waiting','called') ORDER BY created_at ASC,id ASC`;
    return chooseDistinctGuests(areas, guests, override);
  });
}
