import { Controller, Req, Sse } from "@nestjs/common";
import {
  interval,
  from,
  switchMap,
  distinctUntilChanged,
  map,
  startWith,
} from "rxjs";
import { Db } from "../db/prisma.service";
@Controller("events")
export class EventsController {
  constructor(private readonly db: Db) {}
  @Sse() events(@Req() r: any) {
    return interval(5000).pipe(
      startWith(0),
      switchMap(() =>
        from(
          this.db.auditEntry.findFirst({
            where: { shopId: r.user.shopId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true, action: true },
          }),
        ),
      ),
      distinctUntilChanged((a, b) => a?.id === b?.id),
      map((event) => ({
        data: {
          revision: event?.id || "initial",
          event: event?.action || "connected",
        },
      })),
    );
  }
}
