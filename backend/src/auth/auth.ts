import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Db } from "../db/prisma.service";
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: string[]) => SetMetadata("roles", roles);
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: Db,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest();
    let token;
    try {
      token = await this.jwt.verifyAsync(req.cookies?.session || "");
    } catch {
      throw new UnauthorizedException("Please sign in");
    }
    const user = await this.db.user.findUnique({ where: { id: token.sub } });
    if (!user?.active) throw new UnauthorizedException("Account unavailable");
    req.user = {
      id: user.id,
      shopId: user.shopId,
      role: user.role,
      name: user.name,
    };
    const roles = this.reflector.getAllAndOverride<string[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(user.role))
      throw new ForbiddenException("Your role cannot perform this action");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = (
        process.env.CORS_ORIGINS || "http://localhost:3217"
      ).split(",");
      if (origin && !allowed.includes(origin))
        throw new ForbiddenException("Untrusted origin");
      if (req.headers["x-pharmacy-client"] !== "web")
        throw new ForbiddenException("Client header required");
    }
    return true;
  }
}
