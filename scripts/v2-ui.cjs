const fs = require("fs");

function edit(file, transform) {
  let source = fs.readFileSync(file, "utf8");
  const result = transform(source);

  if (result === source) {
    throw new Error("Could not update " + file);
  }

  fs.writeFileSync(file, result);
  console.log("Updated:", file);
}

edit("src/app/join/page.tsx", source => {
  return source.replace(
    "          </form>",
    `            <a
              href="/lookup"
              className="block text-center text-sm font-medium text-[#A78A60] underline"
            >
              Already registered? Find my booking
            </a>
          </form>`
  );
});

edit("src/app/status/page.tsx", source => {
  return source.replace(
    "            {active && (",
    `            {active && (
              <button
                type="button"
                onClick={() => window.alert("Our menu is coming soon.")}
                className="w-full rounded-xl border border-[#DDD5C9] p-3 font-medium text-[#A78A60]"
              >
                Browse Menu
              </button>
            )}

            {active && (`
  );
});

edit("src/app/page.tsx", source => {
  // Turn the disabled Settings control into manager navigation.
  source = source.replace(
    /<button\s+disabled\s+className="rounded-xl border border-white\/10 bg-white\/5 p-3 opacity-40"\s+title="Settings coming soon"\s*>\s*<Settings2 size=\{20\} \/>\s*<\/button>/,
    `<a
      href="/management"
      className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
      title="Management settings"
    >
      <Settings2 size={20} />
    </a>`
  );

  // Add a staff logout control.
  source = source.replace(
    '<div className="flex gap-3">',
    `<div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
                className="rounded-xl border border-white/10 px-4 text-sm hover:bg-white/10"
              >
                Log out
              </button>`
  );

  return source;
});
