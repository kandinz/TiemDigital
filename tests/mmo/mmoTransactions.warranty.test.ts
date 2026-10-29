import { describe, expect, it } from "vitest";
import { computeWarrantyExpireDate } from "../../workers/mmo/routes/mmoTransactions.js";

describe("computeWarrantyExpireDate", () => {
  const startDate = "2026-10-07";

  it("returns null for none or lifetime", () => {
    expect(computeWarrantyExpireDate(startDate, "none")).toBeNull();
    expect(computeWarrantyExpireDate(startDate, "lifetime")).toBeNull();
    expect(computeWarrantyExpireDate(startDate, "")).toBeNull();
  });

  it("calculates correct expiry date for days (e.g. 7d, 14d, 30d)", () => {
    expect(computeWarrantyExpireDate(startDate, "7d")).toBe("2026-10-14");
    expect(computeWarrantyExpireDate(startDate, "14d")).toBe("2026-10-21");
    expect(computeWarrantyExpireDate(startDate, "1d")).toBe("2026-10-08");
  });

  it("calculates correct expiry date for months (e.g. 1m, 6m, 12m)", () => {
    expect(computeWarrantyExpireDate(startDate, "1m")).toBe("2026-11-07");
    expect(computeWarrantyExpireDate(startDate, "6m")).toBe("2027-04-07");
    expect(computeWarrantyExpireDate(startDate, "12m")).toBe("2027-10-07");
  });

  it("returns null for invalid inputs", () => {
    expect(computeWarrantyExpireDate("invalid-date", "7d")).toBeNull();
    expect(computeWarrantyExpireDate(startDate, "invalid-period")).toBeNull();
  });
});
