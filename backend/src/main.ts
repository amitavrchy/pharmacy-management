import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { json } from "express";
import { AppModule } from "./app.module";
import { ErrorFilter } from "./common/error.filter";
async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  app.use(json({ limit: "3mb" }));
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3217").split(","),
    credentials: true,
  });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4217), "127.0.0.1");
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
