import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { json } from "express";
import { AppModule } from "./app.module";
import { ErrorFilter } from "./common/error.filter";
async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // Behind a reverse proxy (Nginx / the Next.js /api rewrite) set TRUST_PROXY
  // (e.g. "loopback,linklocal,uniquelocal") so req.ip is the real client IP.
  if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);
  app.use(helmet());
  app.use(json({ limit: "3mb" }));
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3217")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  // HOST defaults to loopback for local development; the Docker image sets HOST=0.0.0.0.
  await app.listen(
    Number(process.env.PORT || 4217),
    process.env.HOST || "127.0.0.1",
  );
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
