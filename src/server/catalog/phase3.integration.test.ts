/**
 * Phase 3 integration tests against a real PostgreSQL database:  DATABASE_URL=... npm run test:integration
 * WARNING: they TRUNCATE tables (including "User"). Use a throwaway database.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/permissions";
import { emptyWeek, type OpeningHours } from "@/lib/catalog/opening-hours";
import { buildCommissionSnapshot } from "@/server/commissions/service";
import { archiveCategory, createBusinessType, createCategory, setBusinessTypeActive, setCategoryActive, updateBusinessType } from "@/server/catalog/categories";
import { adminArchiveProduct, adminCreateProduct, adminRestoreProduct, adminSetProductAvailability, adminUpdateProduct, listProductsForAdmin, listShopOptions } from "@/server/catalog/admin-products";
import { archiveProduct, createProduct, listOwnProducts, setProductAvailability, updateProduct } from "@/server/catalog/products";
import { getPublicMenu, listPublicMerchants } from "@/server/catalog/public";
import { AuthorizationError, NotFoundError } from "@/server/errors";
import { createShopByAdmin, listOwnerCandidates, readShopImage, updateShopByAdmin, uploadShopImage } from "@/server/merchants/admin-shops";
import { setStorageForTests } from "@/server/uploads/storage";
import { listMerchantsForAdmin, resubmitOwnMerchant, reviewMerchant, saveOwnMerchant, setMerchantTier } from "@/server/merchants/service";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");

const admin: Actor = { id: "admin-1", role: "ADMIN", isSuperAdmin: true, permissions: [] };
const supportOnly: Actor = { id: "admin-2", role: "ADMIN", isSuperAdmin: false, permissions: ["users.view"] };

let counter = 0;
async function makeMerchantUser(): Promise<Actor> {
  counter += 1;
  const user = await db.user.create({
    data: { phone: `+2010${String(counter).padStart(8, "0")}`, name: `Owner ${counter}`, passwordHash: "x", role: "MERCHANT", status: "ACTIVE" },
  });
  return { id: user.id, role: "MERCHANT", isSuperAdmin: false, permissions: [] };
}

function alwaysOpen(): OpeningHours {
  const week = emptyWeek();
  for (const day of Object.keys(week) as (keyof OpeningHours)[]) week[day] = [{ open: "00:00", close: "24:00" }];
  return week;
}

const profile = (name = "مطعم الصقر") => ({ name, businessType: "restaurant", description: "وجبات" });

/** A merchant already approved by the admin. */
async function approvedMerchant(name?: string): Promise<Actor> {
  const owner = await makeMerchantUser();
  expect((await saveOwnMerchant(owner, profile(name), alwaysOpen())).ok).toBe(true);
  const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
  expect((await reviewMerchant(admin, shop.id, "APPROVE")).ok).toBe(true);
  return owner;
}

async function usableCategory(name = "مشويات") {
  await createCategory(admin, { nameAr: name }, null);
  return db.category.findFirstOrThrow({ where: { nameAr: name } });
}

const product = (categoryId: string, over: Record<string, unknown> = {}) => ({ name: "شاورما", description: "", price: "85.50", categoryId, ...over });
const auditFor = (action: string) => db.auditLog.findMany({ where: { action }, orderBy: { createdAt: "asc" } });

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "AuditLog","Category","BusinessType","CommissionRate","User" RESTART IDENTITY CASCADE');
  await db.businessType.create({ data: { code: "restaurant", nameAr: "مطعم" } });
});

describe("merchant profile and review", () => {
  it("creates a pending shop, audited, and a second save updates the same shop", async () => {
    const owner = await makeMerchantUser();
    expect(await saveOwnMerchant(owner, profile(), alwaysOpen())).toEqual({ ok: true, created: true });
    expect(await saveOwnMerchant(owner, profile("اسم جديد"), alwaysOpen())).toEqual({ ok: true, created: false });
    const shops = await db.merchant.findMany();
    expect(shops.length).toBe(1);
    expect(shops[0]?.status).toBe("PENDING_REVIEW");
    expect(shops[0]?.tier).toBe("REGULAR");
    expect((await auditFor("MERCHANT_CREATED")).length).toBe(1);
    expect((await auditFor("MERCHANT_PROFILE_UPDATED")).length).toBe(1);
  });

  it("rejects bad input, unknown/hidden business types, bad hours, and non-merchant roles", async () => {
    const owner = await makeMerchantUser();
    expect((await saveOwnMerchant(owner, { ...profile(), name: "x" }, alwaysOpen())).ok).toBe(false);
    expect((await saveOwnMerchant(owner, { ...profile(), businessType: "ghost" }, alwaysOpen())).ok).toBe(false);
    await setBusinessTypeActive(admin, "restaurant", false);
    expect((await saveOwnMerchant(owner, profile(), alwaysOpen())).ok).toBe(false);
    await setBusinessTypeActive(admin, "restaurant", true);
    expect((await saveOwnMerchant(owner, profile(), { "0": "x" })).ok).toBe(false);
    expect(await db.merchant.count()).toBe(0);
    await expect(saveOwnMerchant({ ...owner, role: "CUSTOMER" }, profile(), alwaysOpen())).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("follows approve / reject(with reason) / resubmit / suspend / reactivate, all audited", async () => {
    const owner = await makeMerchantUser();
    await saveOwnMerchant(owner, profile(), alwaysOpen());
    const shop = await db.merchant.findFirstOrThrow();

    expect(await reviewMerchant(admin, shop.id, "REJECT", " ")).toEqual({ ok: false, error: "REASON_REQUIRED" });
    expect((await reviewMerchant(admin, shop.id, "REJECT", "الأوراق ناقصة")).ok).toBe(true);
    expect((await db.merchant.findFirstOrThrow()).rejectionReason).toBe("الأوراق ناقصة");
    expect((await saveOwnMerchant(owner, profile("تعديل"), alwaysOpen())).ok).toBe(false); // read-only while rejected

    expect((await resubmitOwnMerchant(owner)).ok).toBe(true);
    expect((await reviewMerchant(admin, shop.id, "APPROVE")).ok).toBe(true);
    expect(await reviewMerchant(admin, shop.id, "APPROVE")).toEqual({ ok: false, error: "INVALID_TRANSITION" });
    expect((await reviewMerchant(admin, shop.id, "SUSPEND", "شكاوى")).ok).toBe(true);
    expect((await reviewMerchant(admin, shop.id, "REACTIVATE")).ok).toBe(true);
    expect((await auditFor("MERCHANT_APPROVE")).length).toBe(1); // the second APPROVE was an invalid transition
    expect((await auditFor("MERCHANT_REACTIVATE")).length).toBe(1);
    expect((await auditFor("MERCHANT_SUSPEND")).length).toBe(1);
  });

  it("denies review, tier changes and listing without merchants.review", async () => {
    const owner = await makeMerchantUser();
    await saveOwnMerchant(owner, profile(), alwaysOpen());
    const shop = await db.merchant.findFirstOrThrow();
    await expect(reviewMerchant(supportOnly, shop.id, "APPROVE")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(reviewMerchant(owner, shop.id, "APPROVE")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(setMerchantTier(supportOnly, shop.id, "BUSINESS", "سبب")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listMerchantsForAdmin(owner)).rejects.toBeInstanceOf(AuthorizationError);
    expect((await db.merchant.findFirstOrThrow()).status).toBe("PENDING_REVIEW");
  });

  it("a tier change is audited and never alters a commission already priced", async () => {
    await db.commissionRate.createMany({
      data: [
        { tier: "REGULAR", basisPoints: 800, effectiveFrom: new Date("2000-01-01"), createdById: "seed" },
        { tier: "BUSINESS", basisPoints: 500, effectiveFrom: new Date("2000-01-01"), createdById: "seed" },
      ],
    });
    const owner = await approvedMerchant();
    const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });

    const orderSnapshot = await buildCommissionSnapshot(shop.tier, 20_000); // priced as Basic
    expect(orderSnapshot.commissionBp).toBe(800);

    expect(await setMerchantTier(admin, shop.id, "BUSINESS", "ترقية")).toEqual({ ok: true });
    expect(await setMerchantTier(admin, shop.id, "BUSINESS", "ترقية")).toEqual({ ok: true }); // no-op
    expect((await auditFor("MERCHANT_TIER_CHANGED")).length).toBe(1);

    const after = await db.merchant.findFirstOrThrow();
    expect(after.tier).toBe("BUSINESS");
    expect(orderSnapshot.commissionBp).toBe(800); // the stored order numbers did not move
    expect(orderSnapshot.commissionCents).toBe(1_600);
    expect((await buildCommissionSnapshot(after.tier, 20_000)).commissionBp).toBe(500); // only new orders use 5%
    expect(await setMerchantTier(admin, shop.id, "REGULAR", " ")).toEqual({ ok: false });
  });
});

describe("categories", () => {
  it("allows two levels, refuses a third, duplicates and unauthorized users", async () => {
    await createCategory(admin, { nameAr: "مطاعم" }, null);
    const root = await db.category.findFirstOrThrow();
    expect((await createCategory(admin, { nameAr: "مشويات" }, root.id)).ok).toBe(true);
    const child = await db.category.findFirstOrThrow({ where: { parentId: root.id } });
    expect(await createCategory(admin, { nameAr: "فراخ" }, child.id)).toEqual({ ok: false, error: "PARENT_INVALID" });
    expect(await createCategory(admin, { nameAr: "مطاعم" }, null)).toEqual({ ok: false, error: "DUPLICATE" });
    expect((await createCategory(admin, { nameAr: "م" }, null)).ok).toBe(false);
    await expect(createCategory(supportOnly, { nameAr: "جديد" }, null)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await db.category.count()).toBe(2);
  });

  it("archives instead of deleting, and blocks archiving a parent with live children", async () => {
    await createCategory(admin, { nameAr: "مطاعم" }, null);
    const root = await db.category.findFirstOrThrow();
    await createCategory(admin, { nameAr: "مشويات" }, root.id);
    const child = await db.category.findFirstOrThrow({ where: { parentId: root.id } });
    expect(await archiveCategory(admin, root.id)).toEqual({ ok: false, error: "HAS_ACTIVE_CHILDREN" });
    expect((await archiveCategory(admin, child.id)).ok).toBe(true);
    expect((await archiveCategory(admin, root.id)).ok).toBe(true);
    expect(await db.category.count()).toBe(2); // rows are kept
    expect((await db.category.findFirstOrThrow({ where: { id: root.id } })).archivedAt).not.toBeNull();
    await expect(archiveCategory(admin, root.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("manages business types (admin only, audited)", async () => {
    expect((await createBusinessType(admin, { code: "pharmacy", nameAr: "صيدلية" })).ok).toBe(true);
    expect(await createBusinessType(admin, { code: "pharmacy", nameAr: "صيدلية" })).toEqual({ ok: false, error: "DUPLICATE" });
    expect((await createBusinessType(admin, { code: "Bad Code", nameAr: "x" })).ok).toBe(false);
    await expect(createBusinessType(supportOnly, { code: "bakery", nameAr: "مخبز" })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await auditFor("BUSINESS_TYPE_CREATED")).length).toBe(1);
  });
});

describe("products: ownership, validation, archive", () => {
  it("lets an approved merchant create and edit products; prices are stored as piasters; changes are audited", async () => {
    const owner = await approvedMerchant();
    const category = await usableCategory();
    expect((await createProduct(owner, product(category.id))).ok).toBe(true);
    const created = await db.product.findFirstOrThrow();
    expect(created.priceCents).toBe(8_550);
    expect((await updateProduct(owner, created.id, product(category.id, { price: "90" }))).ok).toBe(true);
    const [entry] = await auditFor("PRODUCT_UPDATED");
    expect((entry?.before as { priceCents: number }).priceCents).toBe(8_550);
    expect((entry?.after as { priceCents: number }).priceCents).toBe(9_000);
  });

  it("rejects invalid prices/names and unusable categories", async () => {
    const owner = await approvedMerchant();
    const category = await usableCategory();
    for (const price of ["0", "-1", "abc", "100000.01"]) {
      expect((await createProduct(owner, product(category.id, { price }))).ok).toBe(false);
    }
    expect((await createProduct(owner, product(category.id, { name: "x" }))).ok).toBe(false);
    expect(await createProduct(owner, product("missing-category"))).toEqual({ ok: false, error: "CATEGORY_UNAVAILABLE" });
    await setCategoryActive(admin, category.id, false);
    expect(await createProduct(owner, product(category.id))).toEqual({ ok: false, error: "CATEGORY_UNAVAILABLE" });
    expect(await db.product.count()).toBe(0);
  });

  it("blocks pending, suspended and non-merchant users from changing any catalog", async () => {
    const category = await usableCategory();
    const pending = await makeMerchantUser();
    await saveOwnMerchant(pending, profile(), alwaysOpen());
    await expect(createProduct(pending, product(category.id))).rejects.toBeInstanceOf(AuthorizationError);

    const owner = await approvedMerchant("متجر آخر");
    const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
    await reviewMerchant(admin, shop.id, "SUSPEND", "مخالفة");
    await expect(createProduct(owner, product(category.id))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createProduct(admin, product(category.id))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createProduct({ ...owner, role: "CUSTOMER" }, product(category.id))).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("IDOR: a merchant can never read, edit, hide or archive another merchant's product", async () => {
    const a = await approvedMerchant("متجر أ");
    const b = await approvedMerchant("متجر ب");
    const category = await usableCategory();
    await createProduct(a, product(category.id));
    const aProduct = await db.product.findFirstOrThrow();

    await expect(updateProduct(b, aProduct.id, product(category.id, { price: "1" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(setProductAvailability(b, aProduct.id, false)).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveProduct(b, aProduct.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listOwnProducts(b)).length).toBe(0);

    const untouched = await db.product.findFirstOrThrow();
    expect(untouched.priceCents).toBe(8_550);
    expect(untouched.isAvailable).toBe(true);
    expect(untouched.archivedAt).toBeNull();
  });

  it("archives instead of deleting: the row stays but disappears from the merchant's list", async () => {
    const owner = await approvedMerchant();
    const category = await usableCategory();
    await createProduct(owner, product(category.id));
    const created = await db.product.findFirstOrThrow();
    await archiveProduct(owner, created.id);
    expect(await db.product.count()).toBe(1);
    const row = await db.product.findFirstOrThrow();
    expect(row.archivedAt).not.toBeNull();
    expect(row.isAvailable).toBe(false);
    expect((await listOwnProducts(owner)).length).toBe(0);
  });
});

describe("public catalog (what customers may see)", () => {
  it("shows only approved shops and never leaks owner or review data", async () => {
    const live = await approvedMerchant("متجر ظاهر");
    const pending = await makeMerchantUser();
    await saveOwnMerchant(pending, profile("قيد المراجعة"), alwaysOpen());
    const suspended = await approvedMerchant("متجر موقوف");
    await reviewMerchant(admin, (await db.merchant.findFirstOrThrow({ where: { ownerId: suspended.id } })).id, "SUSPEND", "سبب");

    const shops = await listPublicMerchants();
    expect(shops.map((s) => s.name)).toEqual(["متجر ظاهر"]);
    expect(Object.keys(shops[0] ?? {}).sort()).toEqual(["address", "businessType", "description", "hasImage", "id", "isOpen", "name"]);
    expect(live.id).toBeTruthy();
  });

  it("hides archived products and products of hidden categories, keeps unavailable ones flagged", async () => {
    const owner = await approvedMerchant();
    const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
    const grill = await usableCategory("مشويات");
    const sweets = await usableCategory("حلويات");
    await createProduct(owner, product(grill.id, { name: "كباب" }));
    await createProduct(owner, product(grill.id, { name: "كفتة" }));
    await createProduct(owner, product(sweets.id, { name: "كنافة" }));
    const kofta = await db.product.findFirstOrThrow({ where: { nameAr: "كفتة" } });
    const kunafa = await db.product.findFirstOrThrow({ where: { nameAr: "كنافة" } });
    await setProductAvailability(owner, kofta.id, false);
    await archiveProduct(owner, kunafa.id);

    const menu = await getPublicMenu(shop.id);
    expect(menu?.products.map((p) => p.nameAr).sort()).toEqual(["كباب", "كفتة"].sort());
    expect(menu?.products.find((p) => p.nameAr === "كفتة")?.isAvailable).toBe(false);

    await setCategoryActive(admin, grill.id, false);
    expect((await getPublicMenu(shop.id))?.products.length).toBe(0);
  });

  it("returns nothing for a shop that is not approved", async () => {
    const pending = await makeMerchantUser();
    await saveOwnMerchant(pending, profile(), alwaysOpen());
    const shop = await db.merchant.findFirstOrThrow();
    expect(await getPublicMenu(shop.id)).toBeNull();
  });

  it("reports a closed shop outside its hours", async () => {
    const owner = await makeMerchantUser();
    await saveOwnMerchant(owner, profile(), emptyWeek()); // every day closed
    const shop = await db.merchant.findFirstOrThrow();
    await reviewMerchant(admin, shop.id, "APPROVE");
    expect((await listPublicMerchants())[0]?.isOpen).toBe(false);
  });
});

describe("admin control of products and business types", () => {
  it("an admin adds, edits, hides and withdraws any shop's products; a withdrawn product cannot be revived by the shop", async () => {
    const owner = await approvedMerchant("متجر أ");
    const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
    const cat = await usableCategory();
    expect(await adminCreateProduct(admin, shop.id, product(cat.id))).toEqual({ ok: true });
    const created = await db.product.findFirstOrThrow({ where: { merchantId: shop.id } });
    expect((await auditFor("PRODUCT_CREATED"))[0]?.after).toMatchObject({ byAdmin: true });
    expect(await adminUpdateProduct(admin, created.id, product(cat.id, { name: "شاورما دجاج", price: "99.00" }))).toEqual({ ok: true });
    expect(await db.product.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ nameAr: "شاورما دجاج", priceCents: 9900 });
    await adminSetProductAvailability(admin, created.id, false);
    expect((await db.product.findUniqueOrThrow({ where: { id: created.id } })).isAvailable).toBe(false);
    expect(await adminArchiveProduct(admin, created.id, "x")).toEqual({ ok: false, error: "REASON_REQUIRED" });
    expect(await adminArchiveProduct(admin, created.id, "منتج مخالف للسياسة")).toEqual({ ok: true });
    expect((await auditFor("PRODUCT_ARCHIVED")).at(-1)?.after).toMatchObject({ reason: "منتج مخالف للسياسة", byAdmin: true });
    expect(await listOwnProducts(owner)).toHaveLength(0);
    await expect(setProductAvailability(owner, created.id, true)).rejects.toBeInstanceOf(NotFoundError); // the shop cannot undo it
    await expect(updateProduct(owner, created.id, product(cat.id))).rejects.toBeInstanceOf(NotFoundError);
    expect((await listProductsForAdmin(admin, { archived: true })).map((p) => p.id)).toEqual([created.id]);
    expect(await listProductsForAdmin(admin, {})).toHaveLength(0);
    await adminRestoreProduct(admin, created.id);
    expect(await db.product.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ archivedAt: null, isAvailable: false });
    expect((await listShopOptions(admin)).map((s) => s.id)).toEqual([shop.id]);
  });

  it("is refused without catalog.manage, for a shop that is not approved, for a hidden category, and across bad input", async () => {
    const owner = await makeMerchantUser();
    await saveOwnMerchant(owner, profile("غير معتمد"), alwaysOpen());
    const pending = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
    const cat = await usableCategory();
    await expect(adminCreateProduct(supportOnly, pending.id, product(cat.id))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(adminArchiveProduct(supportOnly, "x", "سبب كافٍ")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listProductsForAdmin(owner, {})).rejects.toBeInstanceOf(AuthorizationError);
    expect(await adminCreateProduct(admin, pending.id, product(cat.id))).toEqual({ ok: false, error: "SHOP_NOT_APPROVED" });
    await expect(adminCreateProduct(admin, "missing", product(cat.id))).rejects.toBeInstanceOf(NotFoundError);
    expect(await reviewMerchant(admin, pending.id, "APPROVE")).toEqual({ ok: true });
    expect((await adminCreateProduct(admin, pending.id, product(cat.id, { price: "abc" }))).ok).toBe(false);
    await setCategoryActive(admin, cat.id, false);
    expect(await adminCreateProduct(admin, pending.id, product(cat.id))).toEqual({ ok: false, error: "CATEGORY_UNAVAILABLE" });
  });

  it("business types can be renamed and reordered (code fixed), only with catalog.manage", async () => {
    expect(await updateBusinessType(admin, "restaurant", { nameAr: "مطاعم ووجبات", sortOrder: "2" })).toEqual({ ok: true });
    expect(await db.businessType.findUniqueOrThrow({ where: { code: "restaurant" } })).toMatchObject({ nameAr: "مطاعم ووجبات", sortOrder: 2 });
    expect((await updateBusinessType(admin, "restaurant", { nameAr: "م" })).ok).toBe(false);
    await expect(updateBusinessType(admin, "missing", { nameAr: "اسم صحيح" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateBusinessType(supportOnly, "restaurant", { nameAr: "اسم صحيح" })).rejects.toBeInstanceOf(AuthorizationError);
    expect(await auditFor("BUSINESS_TYPE_UPDATED")).toHaveLength(1);
  });
});

describe("admin adds and edits shops", () => {
  const form = (over: Record<string, string> = {}) => ({ name: "مطعم النيل", businessType: "restaurant", description: "مشويات", address: "شارع النيل", phone: "01011112222", phones: "0223456789\n01033334444", facebook: "https://www.facebook.com/nile", whatsapp: "01055556666", ...over });
  const jpegBytes = (size = 64) => Uint8Array.from([0xff, 0xd8, 0xff, ...Array.from({ length: size }, (_, i) => i % 250)]);

  it("creates an approved shop for the chosen owner (who then owns it); only owners without a shop are offered; audited", async () => {
    const owner = await makeMerchantUser();
    const taken = await approvedMerchant();
    expect((await listOwnerCandidates(admin)).map((u) => u.id)).toEqual([owner.id]);
    const r = await createShopByAdmin(admin, owner.id, form());
    expect(r.ok).toBe(true);
    const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
    expect(shop).toMatchObject({ status: "APPROVED", reviewedById: admin.id, contactPhones: ["0223456789", "+201033334444"], socialLinks: { facebook: "https://www.facebook.com/nile", whatsapp: "+201055556666" } });
    expect((await listPublicMerchants()).map((m) => m.id)).toContain(shop.id);
    expect(await listOwnerCandidates(admin)).toEqual([]);
    expect(await createShopByAdmin(admin, owner.id, form())).toMatchObject({ ok: false, errors: { owner: expect.any(String) } }); // already owns one
    expect(await createShopByAdmin(admin, taken.id, form())).toMatchObject({ ok: false }); // has a shop
    const [entry] = await auditFor("MERCHANT_CREATED_BY_ADMIN");
    expect(entry).toMatchObject({ actorId: admin.id, entityId: shop.id, after: { ownerId: owner.id } });
  });

  it("refuses non-merchant, inactive or unknown owners, bad input and unsafe links; creates nothing", async () => {
    const owner = await makeMerchantUser();
    const customer = await db.user.create({ data: { phone: "+201099990000", name: "عميل", passwordHash: "x", role: "CUSTOMER", status: "ACTIVE" } });
    const paused = await makeMerchantUser();
    await db.user.update({ where: { id: paused.id }, data: { status: "SUSPENDED" } });
    for (const id of [customer.id, paused.id, "missing"]) expect(await createShopByAdmin(admin, id, form())).toMatchObject({ ok: false, errors: { owner: expect.any(String) } });
    expect(await createShopByAdmin(admin, owner.id, form({ name: "" }))).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(await createShopByAdmin(admin, owner.id, form({ website: "javascript:alert(1)" }))).toMatchObject({ ok: false, errors: { website: expect.any(String) } });
    expect(await createShopByAdmin(admin, owner.id, form({ businessType: "nope" }))).toMatchObject({ ok: false, errors: { businessType: expect.any(String) } });
    expect(await db.merchant.count()).toBe(0);
  });

  it("editing any shop validates, saves and audits before/after; permissions are enforced everywhere", async () => {
    const owner = await approvedMerchant("قديم");
    const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
    expect(await updateShopByAdmin(admin, shop.id, form({ name: "الاسم الجديد", address: "عنوان جديد" }))).toEqual({ ok: true, id: shop.id });
    expect(await db.merchant.findUniqueOrThrow({ where: { id: shop.id } })).toMatchObject({ name: "الاسم الجديد", address: "عنوان جديد" });
    expect(await auditFor("MERCHANT_UPDATED_BY_ADMIN")).toMatchObject([{ before: { name: "قديم" }, after: { name: "الاسم الجديد", address: "عنوان جديد" } }]);
    expect((await updateShopByAdmin(admin, shop.id, form({ name: "x" }))).ok).toBe(false);
    await expect(updateShopByAdmin(admin, "missing", form())).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateShopByAdmin(supportOnly, shop.id, form())).rejects.toBeInstanceOf(AuthorizationError);
    await expect(createShopByAdmin(supportOnly, owner.id, form())).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listOwnerCandidates(owner)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(uploadShopImage(owner, shop.id, jpegBytes())).rejects.toBeInstanceOf(AuthorizationError); // a shop owner cannot use the admin upload
  });

  it("shop picture: type decided from the bytes, size capped, public only while the shop is approved", async () => {
    const files = new Map<string, Uint8Array>();
    setStorageForTests({ put: async (k, b) => void files.set(k, b), get: async (k) => files.get(k) ?? null });
    try {
      const owner = await approvedMerchant();
      const shop = await db.merchant.findFirstOrThrow({ where: { ownerId: owner.id } });
      expect(await uploadShopImage(admin, shop.id, new Uint8Array(40))).toEqual({ ok: false, error: "INVALID_FILE" });
      expect(await uploadShopImage(admin, shop.id, jpegBytes(6 * 1024 * 1024))).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
      expect(await uploadShopImage(admin, shop.id, jpegBytes())).toEqual({ ok: true });
      expect((await readShopImage(shop.id))?.contentType).toBe("image/jpeg");
      expect((await listPublicMerchants()).find((m) => m.id === shop.id)?.hasImage).toBe(true);
      await reviewMerchant(admin, shop.id, "SUSPEND", "اختبار");
      expect(await readShopImage(shop.id)).toBeNull();
    } finally {
      setStorageForTests(undefined);
    }
  });
});
