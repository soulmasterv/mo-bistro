const fs = require("fs");

function edit(file, transform) {
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);

  if (after === before) {
    throw new Error(`No changes applied to ${file}`);
  }

  fs.writeFileSync(file, after);
  console.log("Updated:", file);
}

const preferenceField = `
            <label className="block text-sm">
              Seating preference
              <select
                value={seatingPreference}
                onChange={e => setSeatingPreference(
                  e.target.value as "indoor" | "outdoor" | "any"
                )}
                className="mt-2 w-full rounded-xl border border-[#DDD5C9] p-3"
              >
                <option value="any">Any available table</option>
                <option value="indoor">Indoor</option>
                <option value="outdoor">Outdoor</option>
              </select>
            </label>
`;

edit("src/app/join/page.tsx", s => {
  s = s.replace(
    "  const [partySize, setPartySize] = useState(2);",
    `  const [partySize, setPartySize] = useState(2);
  const [seatingPreference, setSeatingPreference] =
    useState<"indoor" | "outdoor" | "any">("any");`
  );

  s = s.replace(
    "          party_size: partySize,",
    "          party_size: partySize,\n          seating_preference: seatingPreference,"
  );

  s = s.replace(
    '            {error && (',
    preferenceField + '\n            {error && ('
  );

  return s;
});

edit("src/app/api/join/route.ts", s => {
  s = s.replace(
    "  party_size: z.number().int().min(1).max(30),",
    `  party_size: z.number().int().min(1).max(30),
  seating_preference: z.enum(["indoor", "outdoor", "any"]).default("any"),`
  );

  s = s.replace(
    "    const { name, phone, party_size } = body.data;",
    "    const { name, phone, party_size, seating_preference } = body.data;"
  );

  s = s.replace(
    "confirmed, source, tracking_token_hash",
    "confirmed, source, tracking_token_hash, seating_preference"
  );

  s = s.replace(
    "VALUES (?, ?, ?, 'waiting', ?, 'qr', ?)",
    "VALUES (?, ?, ?, 'waiting', ?, 'qr', ?, ?)"
  );

  s = s.replace(
    "        tokenHash\n      );",
    "        tokenHash,\n        seating_preference\n      );"
  );

  return s;
});

edit("src/app/api/guests/route.ts", s => {
  s = s.replace(
    "  party_size: z.number().int().min(1).max(30),",
    `  party_size: z.number().int().min(1).max(30),
  seating_preference: z.enum(["indoor", "outdoor", "any"]).default("any"),`
  );

  s = s.replace(
    "    const { name, phone, party_size } = body.data;",
    "    const { name, phone, party_size, seating_preference } = body.data;"
  );

  s = s.replace(
    "INSERT INTO guests (name, phone, party_size)",
    "INSERT INTO guests (name, phone, party_size, seating_preference)"
  );

  s = s.replace(
    "VALUES (?, ?, ?)",
    "VALUES (?, ?, ?, ?)"
  );

  s = s.replace(
    ").run(name, phone, party_size);",
    ").run(name, phone, party_size, seating_preference);"
  );

  s = s.replace(
    "SELECT id,name,phone,party_size,status,confirmed,source,created_at,updated_at",
    "SELECT id,name,phone,party_size,seating_preference,status,confirmed,source,created_at,updated_at"
  );

  return s;
});

edit("src/app/page.tsx", s => {
  s = s.replace(
    "  party_size: number;",
    '  party_size: number;\n  seating_preference: "indoor" | "outdoor" | "any";'
  );

  s = s.replace(
    "  const [party, setParty] = useState(2);",
    `  const [party, setParty] = useState(2);
  const [seatingPreference, setSeatingPreference] =
    useState<"indoor" | "outdoor" | "any">("any");`
  );

  s = s.replace(
    "          party_size: party",
    "          party_size: party,\n          seating_preference: seatingPreference"
  );

  s = s.replace(
    "      setParty(2);",
    '      setParty(2);\n      setSeatingPreference("any");'
  );

  s = s.replace(
    "{guest.party_size} guests</span>",
    `{guest.party_size} guests</span>
                        <span className="capitalize text-[#C5A77B]">
                          {guest.seating_preference || "any"} seating
                        </span>`
  );

  // Add preference dropdown inside the staff Add Guest form.
  const anchor = '<button type="submit"';
  const index = s.indexOf(anchor);

  if (index !== -1) {
    s = s.slice(0, index) + `
              <label className="block text-sm">
                Seating preference
                <select
                  value={seatingPreference}
                  onChange={e => setSeatingPreference(
                    e.target.value as "indoor" | "outdoor" | "any"
                  )}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3"
                >
                  <option value="any">Any</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                </select>
              </label>
              ` + s.slice(index);
  }

  return s;
});

edit("src/components/table-availability.tsx", s => {
  s = s.replace(
    "  seats: number;",
    '  seats: number;\n  area: "indoor" | "outdoor";'
  );

  s = s.replace(
    "{table.seats} seats</p>",
    "{table.seats} seats · {table.area}</p>"
  );

  return s;
});
