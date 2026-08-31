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

/** Removes credentials and marks the shop uninstalled. Order rows are kept. */
export async function invalidateShopAccess(shopDomain: string) {
  const domain = normalizeShopDomain(shopDomain);

  return prisma.$transaction([
    prisma.session.deleteMany({
      where: {
        shop: { in: [shopDomain, domain] },
      },
    }),
    prisma.shop.updateMany({
      where: { shopDomain: domain },
      data: {
        isInstalled: false,
        uninstalledAt: new Date(),
      },
    }),
  ]);
}
