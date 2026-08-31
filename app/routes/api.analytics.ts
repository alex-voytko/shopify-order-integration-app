import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticateDashboardApi } from "../lib/api-auth.server";
import { apiError, apiJson } from "../lib/api-response.server";
import { decimalToJsonNumber } from "../lib/money.server";
import { getShopAnalytics } from "../models/order.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticateDashboardApi(request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateDashboardApi(request);

  try {
    const analytics = await getShopAnalytics(shop);

    return apiJson({
      total_orders: analytics.totalOrders,
      total_revenue: decimalToJsonNumber(analytics.totalRevenue),
      top_sku: analytics.topSku,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    apiError(500, "Failed to load analytics", "database_error");
  }
};
