import type { ActionFunctionArgs } from "react-router";
import { OrderFieldError } from "../lib/money.server";
import { validateOrderPayload } from "../lib/order-payload.server";
import {
  logWebhookEvent,
  verifyShopifyWebhook,
  webhookError,
  webhookMethodNotAllowed,
  webhookOk,
} from "../lib/webhooks.server";
import { createOrderIfNotExists } from "../models/order.server";

export const loader = webhookMethodNotAllowed;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId, payload } = await verifyShopifyWebhook(
    request,
    { expectedTopic: "orders/create" },
  );

  let orderId: string | undefined;

  try {
    const order = validateOrderPayload(payload);
    orderId = order.shopifyOrderId;

    const result = await createOrderIfNotExists(shop, order);
    logWebhookEvent({
      shop,
      topic,
      webhookId,
      orderId,
      result,
    });

    return webhookOk();
  } catch (error) {
    if (error instanceof OrderFieldError) {
      logWebhookEvent({
        shop,
        topic,
        webhookId,
        orderId: error.orderId ?? orderId,
        result: error.code,
      });
      webhookError(error.status, error.message, error.code);
    }

    if (error instanceof Response) {
      throw error;
    }

    logWebhookEvent({
      shop,
      topic,
      webhookId,
      orderId,
      result: "error",
    });
    webhookError(500, "Failed to store order", "database_error");
  }
};
