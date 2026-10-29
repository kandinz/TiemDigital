import { ProviderAdapter } from "./types.js";
import { storebatAdapter } from "./storebat.js";
import { prodsellerAdapter } from "./prodseller.js";
import { aitoolsAdapter } from "./aitools.js";
import { tdsresellerAdapter } from "./tdsreseller.js";
import { daiphucAdapter } from "./daiphuc.js";
import { biteAdapter } from "./bite.js";
import { aiverseAdapter } from "./aiverse.js";
import { primedigitalAdapter } from "./primedigital.js";
import { fatcatstoreAdapter } from "./fatcatstore.js";
import { fishymarketAdapter } from "./fishymarket.js";
import { taphoabanloAdapter } from "./taphoabanlo.js";
import { hylehubstoreAdapter } from "./hylehubstore.js";
import { chodaumoiAdapter } from "./chodaumoi.js";
import { shopnguyenanhAdapter } from "./shopnguyenanh.js";
import { kaigubaiAdapter } from "./kaigubai.js";
import { digitalcoreAdapter } from "./digitalcore.js";
import { pandoradigitalAdapter } from "./pandoradigital.js";
import { prastyanekiAdapter } from "./prastyaneki.js";

export * from "./types.js";

/**
 * Bảng đăng ký tĩnh ánh xạ mã định danh nhà cung cấp với adapter tương ứng
 */
export const adapterRegistry: Record<string, ProviderAdapter> = {
  storebat: storebatAdapter,
  prodseller: prodsellerAdapter,
  aitools: aitoolsAdapter,
  shotix1shop: aitoolsAdapter,
  tdsreseller: tdsresellerAdapter,
  daiphuc: daiphucAdapter,
  bite: biteAdapter,
  aiverse: aiverseAdapter,
  primedigital: primedigitalAdapter,
  fatcatstore: fatcatstoreAdapter,
  fishymarket: fishymarketAdapter,
  taphoabanlo: taphoabanloAdapter,
  hylehubstore: hylehubstoreAdapter,
  chodaumoi: chodaumoiAdapter,
  shopnguyenanh: shopnguyenanhAdapter,
  kaigubai: kaigubaiAdapter,
  digitalcore: digitalcoreAdapter,
  pandoradigital: pandoradigitalAdapter,
  prastyaneki: prastyanekiAdapter,
  prastyaaneki: prastyanekiAdapter
};

/**
 * Lấy adapter cho nhà cung cấp dựa theo provider_id
 */
export function getAdapter(providerId: string | undefined): ProviderAdapter | null {
  if (!providerId) return null;
  return adapterRegistry[providerId] || null;
}
