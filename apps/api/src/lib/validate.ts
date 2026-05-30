/** Body parsing + Zod validation, surfaced as the standard error envelope. */
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Parse and validate a JSON body; rejects unknown fields via strict schemas.
 * The `any` input type lets schemas using `.default()`/transforms resolve `T`
 * to their parsed *output* type.
 */
export async function parseBody<T>(c: Context, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "invalid_json" });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HTTPException(422, {
      message: "validation_error",
      cause: result.error.flatten(),
    });
  }
  return result.data;
}
