import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  authenticateDashboardApi,
  parseOrderPagination,
} from "../lib/api-auth.server";
import { apiError, apiJson } from "../lib/api-response.server";
import { listOrdersForShop } from "../models/order.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticateDashboardApi(request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await authenticateDashboardApi(request);
  const pagination = parseOrderPagination(new URL(request.url));

  try {
    const { orders, total } = await listOrdersForShop(shop, pagination);

    return apiJson(orders, {
      headers: {
        "X-Total-Count": String(total),
        "X-Limit": String(pagination.limit),
        "X-Offset": String(pagination.offset),
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    apiError(500, "Failed to load orders", "database_error");
  }
};
