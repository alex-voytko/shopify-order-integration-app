import { describe, expect, it } from "vitest";
import {
  ANALYTICS_TAG,
  hasAnalyticsTag,
  mergeAnalyticsTag,
} from "./order-tags.server";

describe("analytics tag helpers", () => {
  it("detects the tag in a Shopify comma-separated list", () => {
    expect(hasAnalyticsTag("vip, analytics-processed")).toBe(true);
    expect(hasAnalyticsTag("vip")).toBe(false);
  });

  it("does not add the tag twice — this is the loop-prevention check", () => {
    const once = mergeAnalyticsTag("vip");
    expect(once).toBe(`vip, ${ANALYTICS_TAG}`);
    expect(mergeAnalyticsTag(once)).toBe(once);
    expect(hasAnalyticsTag(once)).toBe(true);
  });

  it("treats an incoming echo payload as already processed", () => {
    expect(hasAnalyticsTag(ANALYTICS_TAG)).toBe(true);
  });
});
