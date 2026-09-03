import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { applyInventoryTransaction, getLedgerBalance } from "../src/services/inventoryLedger.service";
import { recordSale } from "../src/services/sales.service";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function main() {
  const existing = await prisma.category.count();
  if (existing > 0) {
    console.log("Database already has data — skipping seed. Drop and recreate the database to reseed from scratch.");
    return;
  }

  console.log("Seeding units...");
  await prisma.unit.createMany({
    data: [
      { code: "g", name: "Gram", dimension: "WEIGHT", toBaseFactor: 1, isBaseUnit: true },
      { code: "kg", name: "Kilogram", dimension: "WEIGHT", toBaseFactor: 1000 },
      { code: "oz", name: "Ounce", dimension: "WEIGHT", toBaseFactor: 28.349523125 },
      { code: "lb", name: "Pound", dimension: "WEIGHT", toBaseFactor: 453.59237 },
      { code: "ml", name: "Milliliter", dimension: "VOLUME", toBaseFactor: 1, isBaseUnit: true },
      { code: "L", name: "Liter", dimension: "VOLUME", toBaseFactor: 1000 },
      { code: "pt", name: "Pint", dimension: "VOLUME", toBaseFactor: 473.176473 },
      { code: "qt", name: "Quart", dimension: "VOLUME", toBaseFactor: 946.352946 },
      { code: "gal", name: "Gallon", dimension: "VOLUME", toBaseFactor: 3785.411784 },
      { code: "each", name: "Each", dimension: "COUNT", toBaseFactor: 1, isBaseUnit: true },
      { code: "dozen", name: "Dozen", dimension: "COUNT", toBaseFactor: 12 },
      { code: "case", name: "Case", dimension: "COUNT", toBaseFactor: 1 }, // product-specific — see Product.caseSize
    ],
  });

  console.log("Seeding categories...");
  const categoryNames = [
    "Meat",
    "Seafood",
    "Produce",
    "Dairy",
    "Cheese",
    "Dry Goods",
    "Sauces",
    "Spices",
    "Frozen",
    "Beverages",
    "Cleaning Supplies",
    "Packaging",
    "Other",
  ];
  const categories: Record<string, string> = {};
  for (let i = 0; i < categoryNames.length; i++) {
    const c = await prisma.category.create({ data: { name: categoryNames[i], sortOrder: i } });
    categories[categoryNames[i]] = c.id;
  }

  console.log("Seeding suppliers...");
  const [sysco, usFoods, coop, oceanFresh] = await Promise.all([
    prisma.supplier.create({ data: { name: "Sysco Foods", contactName: "Dana Ruiz", phone: "555-0101", email: "orders@sysco.example" } }),
    prisma.supplier.create({ data: { name: "US Foods", contactName: "Marcus Lee", phone: "555-0142", email: "orders@usfoods.example" } }),
    prisma.supplier.create({ data: { name: "Local Farm Co-op", contactName: "Ellen Park", phone: "555-0199" } }),
    prisma.supplier.create({ data: { name: "Ocean Fresh Seafood", contactName: "Ravi Shah", phone: "555-0155" } }),
  ]);

  console.log("Seeding users...");
  const [admin, manager, staff1, staff2] = await Promise.all([
    prisma.user.create({ data: { name: "Alex Rivera", email: "alex@restaurant.example", role: "ADMIN" } }),
    prisma.user.create({ data: { name: "Jordan Kim", email: "jordan@restaurant.example", role: "MANAGER" } }),
    prisma.user.create({ data: { name: "Sam Torres", email: "sam@restaurant.example", role: "STAFF" } }),
    prisma.user.create({ data: { name: "Casey Nguyen", email: "casey@restaurant.example", role: "STAFF" } }),
  ]);

  console.log("Seeding products...");
  interface ProductSeed {
    name: string;
    category: string;
    unit: string;
    par: number;
    reorder: number;
    cost: number;
    beginningQty: number;
    supplierId?: string;
    caseSize?: number;
  }

  const products: ProductSeed[] = [
    { name: "Chicken Breast", category: "Meat", unit: "lb", par: 40, reorder: 15, cost: 4.0, beginningQty: 50, supplierId: sysco.id },
    { name: "Ground Beef", category: "Meat", unit: "lb", par: 25, reorder: 10, cost: 5.25, beginningQty: 32, supplierId: sysco.id },
    { name: "Bacon", category: "Meat", unit: "lb", par: 10, reorder: 4, cost: 6.5, beginningQty: 9, supplierId: sysco.id },
    { name: "Sirloin Steak", category: "Meat", unit: "lb", par: 20, reorder: 8, cost: 9.0, beginningQty: 22, supplierId: usFoods.id },
    { name: "Salmon Fillet", category: "Seafood", unit: "lb", par: 12, reorder: 4, cost: 11.0, beginningQty: 14, supplierId: oceanFresh.id },
    { name: "Shrimp", category: "Seafood", unit: "lb", par: 10, reorder: 4, cost: 9.5, beginningQty: 11, supplierId: oceanFresh.id },
    { name: "Lettuce", category: "Produce", unit: "lb", par: 8, reorder: 3, cost: 1.8, beginningQty: 9, supplierId: coop.id },
    { name: "Tomato", category: "Produce", unit: "lb", par: 10, reorder: 3, cost: 2.2, beginningQty: 8, supplierId: coop.id },
    { name: "Onion", category: "Produce", unit: "lb", par: 12, reorder: 4, cost: 0.9, beginningQty: 14, supplierId: coop.id },
    { name: "Milk", category: "Dairy", unit: "L", par: 20, reorder: 6, cost: 1.05, beginningQty: 18, supplierId: usFoods.id },
    { name: "Cheddar Cheese", category: "Cheese", unit: "lb", par: 10, reorder: 4, cost: 4.5, beginningQty: 11, supplierId: usFoods.id },
    { name: "Swiss Cheese", category: "Cheese", unit: "lb", par: 6, reorder: 2, cost: 5.0, beginningQty: 5, supplierId: usFoods.id },
    { name: "Burger Buns", category: "Dry Goods", unit: "each", par: 200, reorder: 60, cost: 0.35, beginningQty: 180, supplierId: usFoods.id },
    { name: "Sandwich Bread", category: "Dry Goods", unit: "each", par: 150, reorder: 40, cost: 0.45, beginningQty: 120, supplierId: usFoods.id },
    { name: "House Sauce", category: "Sauces", unit: "oz", par: 200, reorder: 50, cost: 0.12, beginningQty: 210 },
    { name: "Ketchup", category: "Sauces", unit: "oz", par: 150, reorder: 40, cost: 0.08, beginningQty: 130 },
    { name: "Salt", category: "Spices", unit: "lb", par: 20, reorder: 5, cost: 0.6, beginningQty: 18 },
    { name: "Black Pepper", category: "Spices", unit: "lb", par: 8, reorder: 2, cost: 4.0, beginningQty: 6 },
    { name: "Frozen Fries", category: "Frozen", unit: "lb", par: 40, reorder: 15, cost: 1.6, beginningQty: 45, supplierId: usFoods.id },
    { name: "Ice Cream", category: "Frozen", unit: "L", par: 15, reorder: 5, cost: 3.2, beginningQty: 12, supplierId: usFoods.id },
    { name: "Iced Tea Mix", category: "Beverages", unit: "L", par: 20, reorder: 6, cost: 0.9, beginningQty: 22 },
    { name: "Soda Syrup", category: "Beverages", unit: "L", par: 15, reorder: 4, cost: 2.1, beginningQty: 13 },
    { name: "Dish Soap", category: "Cleaning Supplies", unit: "L", par: 10, reorder: 3, cost: 2.5, beginningQty: 8 },
    { name: "Sanitizer", category: "Cleaning Supplies", unit: "L", par: 10, reorder: 3, cost: 3.0, beginningQty: 7 },
    { name: "To-Go Boxes", category: "Packaging", unit: "each", par: 300, reorder: 80, cost: 0.22, beginningQty: 260 },
    { name: "Napkins", category: "Packaging", unit: "each", par: 1000, reorder: 300, cost: 0.01, beginningQty: 1500, caseSize: 500 },
    { name: "Take-out Bags", category: "Other", unit: "each", par: 200, reorder: 50, cost: 0.08, beginningQty: 175 },
  ];

  const productIds: Record<string, string> = {};
  for (const p of products) {
    const created = await prisma.product.create({
      data: {
        name: p.name,
        categoryId: categories[p.category],
        inventoryUnitCode: p.unit,
        costUnitCode: p.unit,
        parLevel: p.par,
        reorderLevel: p.reorder,
        caseSize: p.caseSize,
        supplierId: p.supplierId,
      },
    });
    productIds[p.name] = created.id;

    // Beginning inventory is recorded as a real PURCHASE transaction 21
    // days ago — never written directly to currentQuantity — establishing
    // both the starting balance and the initial avg/last cost.
    await applyInventoryTransaction({
      productId: created.id,
      type: "PURCHASE",
      quantity: p.beginningQty,
      unitCode: p.unit,
      unitCost: p.cost,
      reason: "Purchase",
      notes: "Beginning inventory (initial stock-up)",
      referenceType: "MANUAL",
      userId: manager.id,
      occurredAt: daysAgo(21),
    });
  }
  const pid = (name: string) => productIds[name];

  console.log("Seeding menu items + recipes + modifiers...");
  interface Ingredient {
    product: string;
    quantity: number;
    unit: string;
  }
  interface MenuItemSeed {
    name: string;
    price: number;
    category: string;
    ingredients: Ingredient[];
    modifiers?: { name: string; ingredients: Ingredient[] }[];
  }

  const menuItems: MenuItemSeed[] = [
    {
      name: "Chicken Sandwich",
      price: 14.0,
      category: "Sandwiches",
      ingredients: [
        { product: "Chicken Breast", quantity: 6, unit: "oz" },
        { product: "Burger Buns", quantity: 1, unit: "each" },
        { product: "House Sauce", quantity: 1, unit: "oz" },
        { product: "Lettuce", quantity: 0.5, unit: "oz" },
      ],
      modifiers: [{ name: "Extra Cheese", ingredients: [{ product: "Cheddar Cheese", quantity: 1, unit: "oz" }] }],
    },
    {
      name: "Steak Sandwich",
      price: 15.5,
      category: "Sandwiches",
      ingredients: [
        { product: "Sirloin Steak", quantity: 6, unit: "oz" },
        { product: "Sandwich Bread", quantity: 1, unit: "each" },
        { product: "Swiss Cheese", quantity: 2, unit: "oz" },
        { product: "House Sauce", quantity: 1, unit: "oz" },
      ],
    },
    {
      name: "Classic Cheeseburger",
      price: 12.5,
      category: "Burgers",
      ingredients: [
        { product: "Ground Beef", quantity: 5, unit: "oz" },
        { product: "Burger Buns", quantity: 1, unit: "each" },
        { product: "Cheddar Cheese", quantity: 1, unit: "oz" },
        { product: "Ketchup", quantity: 0.5, unit: "oz" },
        { product: "Onion", quantity: 0.5, unit: "oz" },
        { product: "Lettuce", quantity: 0.3, unit: "oz" },
        { product: "Tomato", quantity: 0.5, unit: "oz" },
      ],
    },
    {
      name: "Bacon Burger",
      price: 13.5,
      category: "Burgers",
      ingredients: [
        { product: "Ground Beef", quantity: 5, unit: "oz" },
        { product: "Bacon", quantity: 2, unit: "oz" },
        { product: "Burger Buns", quantity: 1, unit: "each" },
        { product: "Cheddar Cheese", quantity: 1, unit: "oz" },
        { product: "Ketchup", quantity: 0.5, unit: "oz" },
      ],
    },
    {
      name: "Grilled Salmon Plate",
      price: 19.0,
      category: "Entrees",
      ingredients: [
        { product: "Salmon Fillet", quantity: 8, unit: "oz" },
        { product: "Lettuce", quantity: 1, unit: "oz" },
        { product: "Tomato", quantity: 1, unit: "oz" },
      ],
    },
    {
      name: "Shrimp Basket",
      price: 16.0,
      category: "Entrees",
      ingredients: [
        { product: "Shrimp", quantity: 6, unit: "oz" },
        { product: "Frozen Fries", quantity: 5, unit: "oz" },
      ],
    },
    {
      name: "French Fries",
      price: 4.5,
      category: "Sides",
      ingredients: [{ product: "Frozen Fries", quantity: 4, unit: "oz" }],
    },
    {
      name: "Side Salad",
      price: 5.0,
      category: "Sides",
      ingredients: [
        { product: "Lettuce", quantity: 3, unit: "oz" },
        { product: "Tomato", quantity: 1, unit: "oz" },
      ],
    },
    {
      name: "Iced Tea",
      price: 3.0,
      category: "Beverages",
      ingredients: [{ product: "Iced Tea Mix", quantity: 0.25, unit: "L" }],
    },
    {
      name: "Soda",
      price: 2.75,
      category: "Beverages",
      ingredients: [{ product: "Soda Syrup", quantity: 0.15, unit: "L" }],
    },
    {
      name: "Kids Burger",
      price: 7.0,
      category: "Kids",
      ingredients: [
        { product: "Ground Beef", quantity: 3, unit: "oz" },
        { product: "Burger Buns", quantity: 1, unit: "each" },
        { product: "Ketchup", quantity: 0.3, unit: "oz" },
      ],
    },
  ];

  const menuItemIds: Record<string, string> = {};
  for (const m of menuItems) {
    const created = await prisma.menuItem.create({
      data: {
        name: m.name,
        sellingPrice: m.price,
        categoryLabel: m.category,
        recipe: {
          create: {
            ingredients: {
              create: m.ingredients.map((i) => ({ productId: pid(i.product), quantity: i.quantity, unitCode: i.unit })),
            },
          },
        },
      },
    });
    menuItemIds[m.name] = created.id;

    for (const mod of m.modifiers ?? []) {
      await prisma.modifier.create({
        data: {
          menuItemId: created.id,
          name: mod.name,
          ingredients: { create: mod.ingredients.map((i) => ({ productId: pid(i.product), quantity: i.quantity, unitCode: i.unit })) },
        },
      });
    }
  }

  // NOTE: Chicken Breast intentionally has no sales/waste/count activity in
  // this seed beyond its beginning-inventory purchase above. That keeps it
  // at a clean, known 50 lb so the exact scenario from the project spec
  // (purchase +30 lb, sell 40 sandwiches @ 6 oz, waste 2 lb, physical count
  // 29 lb) can be run against a predictable starting point — see
  // backend/src/tests/scenario.test.ts / the README's "Test the scenario"
  // section.

  console.log("Seeding sales history (last 10 days, excluding Chicken Sandwich)...");
  const dailyMenu = [
    "Steak Sandwich",
    "Classic Cheeseburger",
    "Bacon Burger",
    "Grilled Salmon Plate",
    "Shrimp Basket",
    "French Fries",
    "Side Salad",
    "Iced Tea",
    "Soda",
    "Kids Burger",
  ];

  // Restocking runs daily, topping any non-chicken product back up to 110%
  // of its par level (a realistic "order up to par" policy) — this is what
  // keeps a 10-day sales simulation from running high-turnover items like
  // buns and sauce negative. Chicken Breast is excluded so its balance stays
  // exactly 50 lb for the scenario test.
  const costByName = Object.fromEntries(products.map((p) => [p.name, p.cost]));
  const parByName = Object.fromEntries(products.map((p) => [p.name, p.par]));
  const unitByName = Object.fromEntries(products.map((p) => [p.name, p.unit]));

  async function restockToPar(date: Date) {
    for (const p of products) {
      if (p.name === "Chicken Breast") continue;
      const balance = await getLedgerBalance(pid(p.name), date);
      const target = parByName[p.name] * 1.1;
      if (balance < target) {
        const qty = Math.round((target - balance) * 100) / 100;
        if (qty <= 0) continue;
        await applyInventoryTransaction({
          productId: pid(p.name),
          type: "PURCHASE",
          quantity: qty,
          unitCode: unitByName[p.name],
          unitCost: costByName[p.name],
          reason: "Purchase",
          notes: "Restock to par",
          referenceType: "MANUAL",
          userId: manager.id,
          occurredAt: date,
        });
      }
    }
  }

  const wasteByDay: Record<number, { product: string; qty: number; unit: string; reason: string; notes: string }[]> = {
    8: [{ product: "Salmon Fillet", qty: 1.5, unit: "lb", reason: "EXPIRED", notes: "Past use-by date" }],
    6: [{ product: "Lettuce", qty: 2, unit: "lb", reason: "SPOILED", notes: "Wilted" }],
    4: [{ product: "Tomato", qty: 3, unit: "lb", reason: "SPOILED", notes: "Overripe, discarded" }],
    3: [{ product: "Cheddar Cheese", qty: 8, unit: "oz", reason: "DROPPED", notes: "Dropped during prep" }],
  };

  console.log("Seeding daily restocking, sales, and waste (last 10 days, excluding Chicken)...");
  for (let day = 10; day >= 1; day--) {
    const dayDate = daysAgo(day);
    await restockToPar(dayDate);

    for (const w of wasteByDay[day] ?? []) {
      const record = await prisma.wasteRecord.create({
        data: {
          productId: pid(w.product),
          quantity: w.qty,
          unitCode: w.unit,
          reason: w.reason,
          wasteDate: dayDate,
          notes: w.notes,
          userId: staff2.id,
        },
      });
      await applyInventoryTransaction({
        productId: pid(w.product),
        type: "WASTE",
        quantity: -w.qty,
        unitCode: w.unit,
        reason: w.reason,
        notes: w.notes,
        referenceType: "WASTE",
        referenceId: record.id,
        userId: staff2.id,
        occurredAt: dayDate,
      });
    }

    const items = dailyMenu
      .filter(() => Math.random() > 0.15)
      .map((name) => ({
        menuItemId: menuItemIds[name],
        quantity: Math.max(1, Math.round(6 + Math.random() * 14)),
      }));
    if (items.length === 0) continue;
    await recordSale({
      saleDate: dayDate,
      source: "MANUAL",
      userId: staff1.id,
      items,
    });
  }

  console.log("Seeding a completed physical count (2 days ago, excludes Chicken Breast)...");
  const countProducts = await prisma.product.findMany({ where: { name: { not: "Chicken Breast" } } });
  const countDate = daysAgo(2);
  const count = await prisma.inventoryCount.create({
    data: { countDate, status: "OPEN", countedByUserId: manager.id, notes: "Routine bi-weekly count" },
  });
  for (const product of countProducts) {
    const theoretical = await getLedgerBalance(product.id, countDate);
    // Simulate small realistic shrinkage: usually within 3%, occasionally a
    // bigger miss worth flagging.
    const noiseFactor = Math.random() < 0.12 ? 0.85 - Math.random() * 0.1 : 0.97 + Math.random() * 0.06;
    const physical = Math.round(theoretical * noiseFactor * 100) / 100;
    await prisma.inventoryCountItem.create({
      data: {
        countId: count.id,
        productId: product.id,
        theoreticalQuantity: theoretical,
        physicalQuantity: physical,
        unitCode: product.inventoryUnitCode,
        varianceQty: physical - theoretical,
        variancePct: theoretical !== 0 ? ((physical - theoretical) / theoretical) * 100 : 0,
      },
    });
  }
  // Apply the count's adjustments through the ledger, same code path the API uses.
  const items = await prisma.inventoryCountItem.findMany({ where: { countId: count.id } });
  for (const item of items) {
    if (item.physicalQuantity == null) continue;
    const varianceQty = item.physicalQuantity - item.theoreticalQuantity;
    if (Math.abs(varianceQty) > 1e-9) {
      await applyInventoryTransaction({
        productId: item.productId,
        type: "PHYSICAL_COUNT",
        quantity: varianceQty,
        unitCode: item.unitCode,
        reason: "Physical count",
        notes: `Count adjustment: theoretical ${item.theoreticalQuantity.toFixed(3)} -> physical ${item.physicalQuantity.toFixed(3)}`,
        referenceType: "COUNT",
        referenceId: count.id,
        userId: manager.id,
        occurredAt: countDate,
      });
    }
  }
  await prisma.inventoryCount.update({ where: { id: count.id }, data: { status: "COMPLETED", completedAt: countDate } });

  console.log("Seed complete.");
  console.log(`  Admin user: ${admin.email}`);
  console.log(`  Manager: ${manager.email}`);
  console.log(`  Staff: ${staff1.email}, ${staff2.email}`);
  console.log(`  Chicken Breast product id: ${pid("Chicken Breast")} (beginning balance: 50 lb, untouched — ready for the scenario test)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
