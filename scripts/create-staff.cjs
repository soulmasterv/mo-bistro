const Database = require("better-sqlite3");
const crypto = require("node:crypto");
const readline = require("node:readline");

const db = new Database("data/waitlist.sqlite");

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK(role IN ('manager','reception')),
    credential_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const role = process.argv[2];
const username = process.argv[3];

if (!["manager", "reception"].includes(role) ||
    !/^[a-zA-Z0-9_.-]{3,32}$/.test(username || "")) {
  console.error(
    "Usage: node scripts/create-staff.cjs manager|reception username"
  );
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(
  role === "manager"
    ? "Manager password (minimum 4 characters): "
    : "Reception password or PIN (minimum 4 characters): ",
  (credential) => {
    rl.close();

    if (
      credential.length < 4
    ) {
      console.error("Credential does not meet the requirements.");
      process.exit(1);
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(credential, salt, 64).toString("hex");

    db.prepare(`
      INSERT INTO staff_users(username,role,credential_hash)
      VALUES (?,?,?)
    `).run(username, role, `${salt}:${hash}`);

    console.log(`Created ${role}: ${username}`);
    db.close();
  }
);
