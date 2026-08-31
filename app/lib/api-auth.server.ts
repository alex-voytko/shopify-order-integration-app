import { authenticate } from "../shopify.server";
import { getShopByDomain, normalizeShopDomain } from "../models/shop.server";
import { apiError } from "./api-response.server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Dashboard APIs authenticate via the Shopify session token.
 * The shop is taken only from that verified session — never from
 * query params or the request body.
 */
export async function authenticateDashboardApi(request: Request) {
  if (request.method !== "GET") {
    apiError(405, "Method Not Allowed", "method_not_allowed");
  }

  let shop: string;

  try {
    const { session } = await authenticate.admin(request);
    shop = normalizeShopDomain(session.shop);
  } catch (error) {
    if (error instanceof Response) {
      if (error.status >= 300 && error.status < 400) {
        apiError(401, "Unauthorized", "unauthorized");
      }
      throw error;
    }

    apiError(401, "Unauthorized", "unauthorized");
  }

  const installedShop = await getShopByDomain(shop);
  if (!installedShop || !installedShop.isInstalled) {
    apiError(403, "This app is not installed on this store", "not_installed");
  }

  return { shop };
}

export function parseOrderPagination(url: URL) {
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");

  const limit = limitRaw == null ? DEFAULT_LIMIT : Number.parseInt(limitRaw, 10);
  const offset = offsetRaw == null ? 0 : Number.parseInt(offsetRaw, 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    apiError(400, "limit must be an integer between 1 and 100", "invalid_pagination");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    apiError(400, "offset must be a non-negative integer", "invalid_pagination");
  }

  return { limit, offset };
}
