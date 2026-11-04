import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof HttpException)
      return response
        .status(error.getStatus())
        .json({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return response.status(409).json({
          message: "This record already exists (check barcode or email).",
        });
      if (error.code === "P2025")
        return response.status(404).json({ message: "Record not found" });
    }
    Logger.error(error instanceof Error ? error.stack : "Unknown server error");
    response
      .status(500)
      .json({ message: "The request could not be completed. Please retry." });
  }
}
