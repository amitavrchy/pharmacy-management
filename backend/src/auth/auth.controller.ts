import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { Db } from "../db/prisma.service";
import { Public } from "./auth";
import { verifyPassword, hashPassword } from "./password";
import { parse, z, text } from "../common/validation";
@Controller("auth")
export class AuthController {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(
    private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}
  @Public()
  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      req.headers["x-pharmacy-client"] !== "web" ||
      (req.headers.origin &&
        !(process.env.CORS_ORIGINS || "http://localhost:3217")
          .split(",")
          .includes(req.headers.origin))
    )
      throw new ForbiddenException("Untrusted sign-in request");
    const input = parse(z.object({ email: z.email(), password: text }), body),
      key = `${req.ip}:${input.email.toLowerCase()}`;
    const now = Date.now();
    for (const [k, v] of this.attempts)
      if (v.until < now) this.attempts.delete(k);
    const attempt = this.attempts.get(key) || { count: 0, until: now + 900000 };
    if (attempt.count >= 8)
      throw new UnauthorizedException(
        "Too many attempts. Try again in 15 minutes.",
      );
    const user = await this.db.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user?.active || !verifyPassword(input.password, user.passwordHash)) {
      attempt.count++;
      this.attempts.set(key, attempt);
      throw new UnauthorizedException("Email or password is incorrect");
    }
    this.attempts.delete(key);
    res.cookie("session", await this.jwt.signAsync({ sub: user.id }), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 3600000,
      path: "/",
    });
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      shopId: user.shopId,
    };
  }
  @Get("me") async me(@Req() req: any) {
    return {
      ...req.user,
      shop: await this.db.shop.findUnique({ where: { id: req.user.shopId } }),
    };
  }
  @Post("logout") logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("session", { path: "/" });
    return { ok: true };
  }
  @Post("password") async password(@Req() req: any, @Body() body: unknown) {
    const input = parse(
      z.object({ current: text, password: z.string().min(12).max(200) }),
      body,
    );
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: req.user.id },
    });
    if (!verifyPassword(input.current, user.passwordHash))
      throw new UnauthorizedException("Current password is incorrect");
    await this.db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(input.password) },
    });
    return { ok: true };
  }
}
