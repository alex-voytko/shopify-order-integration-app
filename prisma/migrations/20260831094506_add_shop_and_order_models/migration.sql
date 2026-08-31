-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "totalPrice" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "shopifyCreatedAt" DATETIME NOT NULL,
    "shopifyUpdatedAt" DATETIME NOT NULL,
    "processedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop" ("shopDomain") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT,
    "sku" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL NOT NULL,
    CONSTRAINT "LineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Order_shopDomain_idx" ON "Order"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopDomain_shopifyOrderId_key" ON "Order"("shopDomain", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "LineItem_orderId_idx" ON "LineItem"("orderId");

-- CreateIndex
CREATE INDEX "LineItem_sku_idx" ON "LineItem"("sku");

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");
