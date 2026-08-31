import { Prisma } from "@prisma/client";
import { OrderFieldError, parseMoney } from "./money.server";

export type ValidatedLineItem = {
  shopifyLineItemId: string | null;
  sku: string;
  quantity: number;
  price: Prisma.Decimal;
};

export type ValidatedOrder = {
  shopifyOrderId: string;
  customerEmail: string | null;
  totalPrice: Prisma.Decimal;
  currency: string;
  tags: string;
  shopifyCreatedAt: Date;
  shopifyUpdatedAt: Date;
  lineItems: ValidatedLineItem[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseShopifyId(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }

  throw new OrderFieldError(`Missing or invalid ${field}`, "missing_field");
}

function parseOptionalShopifyId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return parseShopifyId(value, "line item id");
}

function parseQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  throw new OrderFieldError("Invalid line item quantity", "invalid_quantity");
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OrderFieldError(`Missing ${field}`, "missing_field");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new OrderFieldError(`Invalid ${field}`, "invalid_date");
  }

  return date;
}

function parseCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new OrderFieldError("Missing or invalid currency", "missing_field");
  }

  return value.trim().toUpperCase();
}

function parseTags(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function parseCustomerEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim();
  return email === "" ? null : email;
}

function parseSku(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseLineItem(value: unknown): ValidatedLineItem {
  if (!isPlainObject(value)) {
    throw new OrderFieldError("Malformed line item", "malformed_payload");
  }

  return {
    shopifyLineItemId: parseOptionalShopifyId(value.id),
    sku: parseSku(value.sku),
    quantity: parseQuantity(value.quantity),
    price: parseMoney(value.price, "line item price"),
  };
}

export function validateOrderPayload(payload: unknown): ValidatedOrder {
  if (!isPlainObject(payload)) {
    throw new OrderFieldError("Malformed webhook payload", "malformed_payload");
  }

  const shopifyOrderId = parseShopifyId(payload.id, "order id");

  try {
    if (payload.line_items != null && !Array.isArray(payload.line_items)) {
      throw new OrderFieldError("Malformed line items", "malformed_payload");
    }

    const lineItems = Array.isArray(payload.line_items)
      ? payload.line_items.map(parseLineItem)
      : [];

    const shopifyCreatedAt = parseDate(payload.created_at, "created_at");
    const shopifyUpdatedAt =
      payload.updated_at == null || payload.updated_at === ""
        ? shopifyCreatedAt
        : parseDate(payload.updated_at, "updated_at");

    return {
      shopifyOrderId,
      customerEmail: parseCustomerEmail(payload.email),
      totalPrice: parseMoney(payload.total_price, "total_price"),
      currency: parseCurrency(payload.currency),
      tags: parseTags(payload.tags),
      shopifyCreatedAt,
      shopifyUpdatedAt,
      lineItems,
    };
  } catch (error) {
    if (error instanceof OrderFieldError) {
      error.orderId = shopifyOrderId;
    }
    throw error;
  }
}
