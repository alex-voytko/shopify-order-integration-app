import prisma from "../db.server";

export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase();
}

export async function upsertInstalledShop(shopDomain: string) {
  const domain = normalizeShopDomain(shopDomain);
  const now = new Date();

  return prisma.shop.upsert({
    where: { shopDomain: domain },
    create: {
      shopDomain: domain,
      isInstalled: true,
      installedAt: now,
      uninstalledAt: null,
    },
    update: {
      isInstalled: true,
      installedAt: now,
      uninstalledAt: null,
    },
  });
}

export async function getShopByDomain(shopDomain: string) {
  return prisma.shop.findUnique({
    where: { shopDomain: normalizeShopDomain(shopDomain) },
  });
}

export async function isShopInstalled(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: normalizeShopDomain(shopDomain) },
    select: { isInstalled: true },
  });

  return shop?.isInstalled === true;
}

export async function requireInstalledShop(shopDomain: string) {
  const shop = await getShopByDomain(shopDomain);

  if (!shop || !shop.isInstalled) {
    throw new Response("This app is not installed on this store", {
      status: 403,
    });
  }

  return shop;
}

export async function markShopUninstalled(shopDomain: string) {
  return prisma.shop.updateMany({
    where: { shopDomain: normalizeShopDomain(shopDomain) },
    data: {
      isInstalled: false,
      uninstalledAt: new Date(),
    },
  });
}

export async function deleteShopSessions(shopDomain: string) {
  const domain = normalizeShopDomain(shopDomain);

  return prisma.session.deleteMany({
    where: {
      shop: { in: [shopDomain, domain] },
    },
  });
}

function parseWebhookTriggeredAt(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Removes credentials and marks the shop uninstalled. Order rows are kept.
 * A delayed retry of app/uninstalled must not wipe a newer reinstall.
 */
export async function invalidateShopAccess(
  shopDomain: string,
  options?: { triggeredAt?: string | Date | null },
) {
  const domain = normalizeShopDomain(shopDomain);
  const triggeredAt = parseWebhookTriggeredAt(options?.triggeredAt ?? null);

  return prisma.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({
      where: { shopDomain: domain },
      select: { isInstalled: true, installedAt: true },
    });

    if (
      shop?.isInstalled &&
      triggeredAt &&
      shop.installedAt.getTime() > triggeredAt.getTime()
    ) {
      return "ignored_stale" as const;
    }

    await tx.session.deleteMany({
      where: {
        shop: { in: [shopDomain, domain] },
      },
    });
    await tx.shop.updateMany({
      where: { shopDomain: domain },
      data: {
        isInstalled: false,
        uninstalledAt: new Date(),
      },
    });

    return "uninstalled" as const;
  });
}
