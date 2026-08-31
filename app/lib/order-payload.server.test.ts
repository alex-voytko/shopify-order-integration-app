import { describe, expect, it } from "vitest";
import { OrderFieldError } from "./money.server";
import { validateOrderPayload } from "./order-payload.server";

const validPayload = {
  id: 1001,
  email: "john@example.com",
  created_at: "2026-03-10T18:30:00Z",
  updated_at: "2026-03-10T18:30:00Z",
  currency: "USD",
  total_price: "120.50",
  tags: "",
  line_items: [
    { id: 2001, sku: "TSHIRT-RED", quantity: 2, price: "40.00" },
    { id: 2002, sku: "CAP-BLACK", quantity: 1, price: "40.50" },
  ],
};

describe("validateOrderPayload", () => {
  it("parses the assignment example payload", () => {
    const order = validateOrderPayload(validPayload);

    expect(order.shopifyOrderId).toBe("1001");
    expect(order.customerEmail).toBe("john@example.com");
    expect(order.totalPrice.equals("120.50")).toBe(true);
    expect(order.currency).toBe("USD");
    expect(order.lineItems).toHaveLength(2);
    expect(order.lineItems[0]?.quantity).toBe(2);
  });

  it("stores a missing email as null and an empty SKU as an empty string", () => {
    const order = validateOrderPayload({
      ...validPayload,
      email: "",
      line_items: [{ quantity: 1, price: "10.00" }],
    });

    expect(order.customerEmail).toBeNull();
    expect(order.lineItems[0]?.sku).toBe("");
  });

  it("rejects invalid prices and quantities", () => {
    expect(() =>
      validateOrderPayload({ ...validPayload, total_price: "abc" }),
    ).toThrow(OrderFieldError);

    expect(() =>
      validateOrderPayload({
        ...validPayload,
        line_items: [{ sku: "X", quantity: -1, price: "1.00" }],
      }),
    ).toThrow(OrderFieldError);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => validateOrderPayload("nope")).toThrow(OrderFieldError);
  });
});
