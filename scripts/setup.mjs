import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
const password = randomBytes(24).toString("hex");
if (!existsSync(".env"))
  writeFileSync(".env", `POSTGRES_PASSWORD=${password}\n`);
if (!existsSync("backend/.env")) {
  const { readFileSync } = await import("node:fs");
  const dbPassword = readFileSync(".env", "utf8").match(
    /^POSTGRES_PASSWORD=(.+)$/m,
  )?.[1];
  if (!dbPassword) throw new Error("POSTGRES_PASSWORD missing from .env");
  writeFileSync(
    "backend/.env",
    `DATABASE_URL=postgresql://pharmacy:${dbPassword}@localhost:5436/pharmacy\nREDIS_URL=redis://localhost:6386\nJWT_SECRET=${randomBytes(48).toString("hex")}\nAPP_URL=http://localhost:3217\nCORS_ORIGINS=http://localhost:3217\nSEED_PASSWORD=${randomBytes(16).toString("base64url")}\n`,
  );
}
console.log(
  "Local secrets configured. Seed account password is in backend/.env (SEED_PASSWORD).",
);
