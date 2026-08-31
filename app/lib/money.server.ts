import { Prisma } from "@prisma/client";

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseMoney(value: unknown, field: string): Prisma.Decimal {
  if (value === null || value === undefined || value === "") {
    throw new OrderFieldError(`Missing ${field}`, "invalid_price");
  }

  // Shopify sends money as strings. Integer numbers are safe; floats are not.
  let raw: string | null = null;

  if (typeof value === "string") {
    raw = value.trim();
  } else if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    raw = String(value);
  }

  if (!raw || !MONEY_PATTERN.test(raw)) {
    throw new OrderFieldError(`Invalid ${field}`, "invalid_price");
  }

  return new Prisma.Decimal(raw);
}

/** JSON numbers are required by the assignment API examples. Arithmetic stays on Decimal. */
export function decimalToJsonNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

export class OrderFieldError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    public orderId?: string,
  ) {
    super(message);
    this.name = "OrderFieldError";
  }
}
