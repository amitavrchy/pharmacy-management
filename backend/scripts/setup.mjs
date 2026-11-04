import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("infra", { recursive: true });
if (!existsSync("infra/.env"))
  writeFileSync(
    "infra/.env",
    `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\n`,
  );
if (!existsSync(".env")) {
  const password = readFileSync("infra/.env", "utf8").match(
    /^POSTGRES_PASSWORD=(.+)$/m,
  )?.[1];
  if (!password) throw new Error("POSTGRES_PASSWORD missing from infra/.env");
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://pharmacy:${password}@localhost:5436/pharmacy\nREDIS_URL=redis://localhost:6386\nJWT_SECRET=${randomBytes(48).toString("hex")}\nAPP_URL=http://localhost:3217\nCORS_ORIGINS=http://localhost:3217\nSEED_PASSWORD=${randomBytes(16).toString("base64url")}\n`,
  );
}
console.log(
  "Backend secrets configured. Read SEED_PASSWORD from backend/.env to sign in.",
);
