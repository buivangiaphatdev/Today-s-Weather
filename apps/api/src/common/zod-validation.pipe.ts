import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { z } from "zod";

// Validates and transforms a request part (e.g. @Query()) with a Zod schema.
// Invalid input -> 400 with per-field messages: { errors: { lat: ["..."] } }
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid query parameters",
        errors: z.flattenError(result.error).fieldErrors,
      });
    }
    return result.data;
  }
}
