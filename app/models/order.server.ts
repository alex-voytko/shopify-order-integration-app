import { Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { decimalToJsonNumber } from "../lib/money.server";
import type { OrderApiItem } from "../lib/order-api";
import type { ValidatedLineItem, ValidatedOrder } from "../lib/order-payload.server";
import { hasAnalyticsTag, mergeAnalyticsTag, splitTags } from "../lib/order-tags.server";
import { addAnalyticsProcessedTag } from "../lib/shopify-order-tag.server";
import { normalizeShopDomain } from "./shop.server";

export type { OrderApiItem };

export type CreateOrderResult = "created" | "duplicate";

export type OrderUpdateResult = {
  result: "created_from_update" | "updated" | "ignored_stale";
  tag: "added" | "already_present" | "already_applied" | "skipped_no_admin";
};

function lineItemCreateData(item: ValidatedLineItem) {
  return {
    shopifyLineItemId: item.shopifyLineItemId,
    sku: item.sku,
    quantity: item.quantity,
    price: item.price,
  };
}

/**
 * Duplicate deliveries are identified by shop + Shopify order id.
 * A repeated orders/create does not insert another row, change totals,
 * or add line-item quantities again. Existing rows are left untouched
 * so a later orders/updated is not overwritten by a delayed create.
 */
export async function createOrderIfNotExists(
  shopDomain: string,
  order: ValidatedOrder,
): Promise<CreateOrderResult> {
  const domain = normalizeShopDomain(shopDomain);

  const existing = await prisma.order.findUnique({
    where: {
      shopDomain_shopifyOrderId: {
        shopDomain: domain,
        shopifyOrderId: order.shopifyOrderId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return "duplicate";
  }

  try {
    await prisma.$transaction(async (tx) => {
      await ensureShopRecord(tx, domain);
      await tx.order.create({
        data: buildOrderCreateData(domain, order),
      });
    });

    return "created";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }

    throw error;
  }
}

/**
 * Loop prevention is durable in the database, not memory:
 * 1. Incoming tags already include analytics-processed → no Admin API call.
 *    This is the echo webhook caused by our own tag write.
 * 2. analyticsTagAppliedAt or stored tags already have the tag → no API call.
 * 3. Otherwise add the tag once, then persist the timestamp.
 *
 * Out-of-order updates keep the newer shopifyUpdatedAt. A missing
 * orders/create is created from this payload so analytics still have
 * one row per shop + order id.
 */
export async function applyOrderUpdate(
  shopDomain: string,
  incoming: ValidatedOrder,
  admin?: AdminApiContext,
): Promise<OrderUpdateResult> {
  const domain = normalizeShopDomain(shopDomain);
  const persisted = await persistOrderUpdate(domain, incoming);
  const tag = await syncAnalyticsTag(persisted.order, incoming, admin);

  return {
    result: persisted.result,
    tag,
  };
}

async function persistOrderUpdate(domain: string, incoming: ValidatedOrder) {
  return prisma.$transaction(async (tx) => {
    await ensureShopRecord(tx, domain);

    const existing = await tx.order.findUnique({
      where: {
        shopDomain_shopifyOrderId: {
          shopDomain: domain,
          shopifyOrderId: incoming.shopifyOrderId,
        },
      },
    });

    if (!existing) {
      const created = await tx.order.create({
        data: buildOrderCreateData(domain, incoming),
      });
      return { result: "created_from_update" as const, order: created };
    }

    const isStale = incoming.shopifyUpdatedAt < existing.shopifyUpdatedAt;
    if (isStale) {
      if (hasAnalyticsTag(incoming.tags) && !hasAnalyticsTag(existing.tags)) {
        const updated = await tx.order.update({
          where: { id: existing.id },
          data: {
            tags: mergeAnalyticsTag(existing.tags),
            analyticsTagAppliedAt: existing.analyticsTagAppliedAt ?? new Date(),
            processedAt: new Date(),
          },
        });
        return { result: "ignored_stale" as const, order: updated };
      }

      return { result: "ignored_stale" as const, order: existing };
    }

    await tx.lineItem.deleteMany({ where: { orderId: existing.id } });

    const updated = await tx.order.update({
      where: { id: existing.id },
      data: {
        customerEmail: incoming.customerEmail,
        totalPrice: incoming.totalPrice,
        currency: incoming.currency,
        tags: incoming.tags,
        shopifyCreatedAt: incoming.shopifyCreatedAt,
        shopifyUpdatedAt: incoming.shopifyUpdatedAt,
        processedAt: new Date(),
        analyticsTagAppliedAt: hasAnalyticsTag(incoming.tags)
          ? (existing.analyticsTagAppliedAt ?? new Date())
          : existing.analyticsTagAppliedAt,
        lineItems: {
          create: incoming.lineItems.map(lineItemCreateData),
        },
      },
    });

    return { result: "updated" as const, order: updated };
  });
}

async function syncAnalyticsTag(
  order: { id: string; tags: string; analyticsTagAppliedAt: Date | null },
  incoming: ValidatedOrder,
  admin?: AdminApiContext,
): Promise<OrderUpdateResult["tag"]> {
  if (
    hasAnalyticsTag(incoming.tags) ||
    hasAnalyticsTag(order.tags) ||
    order.analyticsTagAppliedAt
  ) {
    return order.analyticsTagAppliedAt && !hasAnalyticsTag(incoming.tags)
      ? "already_applied"
      : "already_present";
  }

  if (!admin) {
    return "skipped_no_admin";
  }

  await addAnalyticsProcessedTag(admin, incoming.shopifyOrderId);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      tags: mergeAnalyticsTag(order.tags),
      analyticsTagAppliedAt: new Date(),
    },
  });

  return "added";
}

async function ensureShopRecord(
  tx: Prisma.TransactionClient,
  shopDomain: string,
) {
  await tx.shop.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      isInstalled: true,
    },
    update: {},
  });
}

export async function listOrdersForShop(
  shopDomain: string,
  pagination: { limit: number; offset: number },
) {
  const domain = normalizeShopDomain(shopDomain);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { shopDomain: domain },
      orderBy: { shopifyCreatedAt: "desc" },
      take: pagination.limit,
      skip: pagination.offset,
      include: {
        lineItems: {
          select: { quantity: true },
        },
      },
    }),
    prisma.order.count({ where: { shopDomain: domain } }),
  ]);

  const mappedOrders: OrderApiItem[] = orders.map((order) => ({
      order_id: Number.parseInt(order.shopifyOrderId, 10),
      customer_email: order.customerEmail,
      total_price: decimalToJsonNumber(order.totalPrice),
      currency: order.currency,
      items_count: order.lineItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      tags: splitTags(order.tags),
      created_at: order.shopifyCreatedAt.toISOString(),
      updated_at: order.shopifyUpdatedAt.toISOString(),
  }));

  return {
    orders: mappedOrders,
    total,
  };
}

export async function getShopAnalytics(shopDomain: string) {
  const domain = normalizeShopDomain(shopDomain);

  const [totalOrders, revenue, skuTotals] = await Promise.all([
    prisma.order.count({ where: { shopDomain: domain } }),
    prisma.order.aggregate({
      where: { shopDomain: domain },
      _sum: { totalPrice: true },
    }),
    prisma.lineItem.groupBy({
      by: ["sku"],
      where: {
        sku: { not: "" },
        order: { shopDomain: domain },
      },
      _sum: { quantity: true },
    }),
  ]);

  let topSku: string | null = null;
  let topQuantity = 0;

  for (const row of skuTotals) {
    const quantity = row._sum.quantity ?? 0;
    if (
      quantity > topQuantity ||
      (quantity === topQuantity && topSku !== null && row.sku < topSku)
    ) {
      topQuantity = quantity;
      topSku = row.sku;
    }
  }

  return {
    totalOrders,
    totalRevenue: revenue._sum.totalPrice ?? new Prisma.Decimal(0),
    topSku,
  };
}

export async function getLatestOrderProcessedAt(shopDomain: string) {
  const domain = normalizeShopDomain(shopDomain);

  const latest = await prisma.order.findFirst({
    where: { shopDomain: domain },
    orderBy: { processedAt: "desc" },
    select: { processedAt: true },
  });

  return latest?.processedAt ?? null;
}

function buildOrderCreateData(shopDomain: string, order: ValidatedOrder) {
  return {
    shopDomain,
    shopifyOrderId: order.shopifyOrderId,
    customerEmail: order.customerEmail,
    totalPrice: order.totalPrice,
    currency: order.currency,
    tags: order.tags,
    shopifyCreatedAt: order.shopifyCreatedAt,
    shopifyUpdatedAt: order.shopifyUpdatedAt,
    processedAt: new Date(),
    analyticsTagAppliedAt: hasAnalyticsTag(order.tags) ? new Date() : null,
    lineItems: {
      create: order.lineItems.map(lineItemCreateData),
    },
  };
}
