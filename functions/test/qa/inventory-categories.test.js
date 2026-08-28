// Inventory categories: the workshop's own words for what it keeps.
//
// The rule worth protecting: an item must never be orphaned. Categories used to
// be a frozen list, so items always pointed at something real. Now that the list
// is editable, every path that removes a category has to say where its items go
// — and a rename has to travel to the items, because an item stores the category
// TITLE (so CSV exports stay readable and imports stay matchable).
//
// Run: node test/qa/inventory-categories.test.js
const assert = require("assert");

function pass(name) { console.log("PASS ", name); }

// ---- a small in-memory Firestore, enough for these callables ----------------
function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([path, value]) => [path, { ...value }]));
  const docRef = (path) => ({
    path,
    async get() {
      const data = store.get(path);
      return { exists: Boolean(data), data: () => (data ? { ...data } : {}), ref: docRef(path), id: path.split("/").pop() };
    },
    async set(value, options) {
      const existing = options && options.merge ? store.get(path) || {} : {};
      store.set(path, { ...existing, ...value });
    },
    async delete() { store.delete(path); }
  });
  function collection(prefix) {
    const filters = [];
    const api = {
      doc: (id) => docRef(`${prefix}/${id}`),
      where(field, _op, value) { filters.push([field, value]); return api; },
      select() { return api; },
      limit() { return api; },
      orderBy() { return api; },
      startAfter() { return api; },
      async get() {
        const docs = [...store.entries()]
          .filter(([path]) => path.startsWith(`${prefix}/`) && path.slice(prefix.length + 1).indexOf("/") === -1)
          .filter(([, data]) => filters.every(([field, value]) => data[field] === value))
          .map(([path, data]) => ({ id: path.split("/").pop(), data: () => ({ ...data }), ref: docRef(path) }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      }
    };
    return api;
  }
  const firestore = () => ({
    collection: (name) => ({
      doc: (id) => ({
        ...docRef(`${name}/${id}`),
        collection: (sub) => collection(`${name}/${id}/${sub}`)
      }),
      where: (...args) => collection(name).where(...args),
      get: () => collection(name).get()
    }),
    batch() {
      const writes = [];
      return {
        set: (ref, value, options) => writes.push([ref, value, options]),
        async commit() { for (const [ref, value, options] of writes) await ref.set(value, options); }
      };
    }
  });
  return { firestore, store };
}

class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function build(seed) {
  const { firestore, store } = makeDb(seed);
  const handlers = {};
  const admin = { firestore, __store: store };
  admin.firestore.FieldValue = { delete: () => "__delete__" };
  admin.firestore.FieldPath = { documentId: () => "__name__" };
  const module = require("../../inventory").createInventoryFunctions({
    admin,
    onCall: (_options, handler) => handler,
    HttpsError: FakeHttpsError,
    requireWorkspace: async () => ({ uid: "u1", email: "a@b.c", companyId: "co" }),
    cleanText: (value, fallback = "", max = 200) => {
      const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
      return text || fallback;
    },
    roundMoney: (value) => Math.round(Number(value) * 100) / 100
  });
  Object.assign(handlers, module);
  return { fns: module, store };
}

const call = (handler, data) => handler({ data, auth: { uid: "u1" } });
const itemPath = (id) => `companies/co/inventoryItems/${id}`;

async function main() {

// 1. Defaults: an untouched workspace still sees the original ten categories,
// so nothing changes underfoot for anyone who never opens the editor.
{
  const { fns } = build({});
  const { categoriesFromSettings, defaultCategories } = fns._internal;
  assert.deepStrictEqual(
    categoriesFromSettings({}).map(c => c.title),
    defaultCategories().map(c => c.title)
  );
  assert.strictEqual(categoriesFromSettings({}).length, 10);
  assert(categoriesFromSettings({}).every(c => c.icon && c.id), "every category has an id and an icon");
  pass("an untouched workspace keeps the original list");
}

// 2. Repair: junk never yields an empty list, and there is always somewhere to
// put an item whose category is removed.
{
  const { fns } = build({});
  const { categoriesFromSettings } = fns._internal;
  assert.strictEqual(categoriesFromSettings({ inventoryCategories: [null, 7, { title: "" }] }).length, 10);
  const custom = categoriesFromSettings({ inventoryCategories: [{ title: "Gemstones" }, { title: "Clasps" }] });
  assert.deepStrictEqual(custom.map(c => c.title), ["Gemstones", "Clasps", "Other"]);
  // Colliding ids would collapse two rows into one on screen.
  const collide = categoriesFromSettings({ inventoryCategories: [{ id: "x", title: "Cases" }, { id: "x", title: "Clasps" }] });
  assert.strictEqual(new Set(collide.map(c => c.id)).size, collide.length);
  pass("a broken list is repaired and always keeps a fallback");
}

// 3. A rename travels to the items. This is the spec's "one central name":
// rename Watches → Complete Watches and the items follow.
{
  const { fns, store } = build({
    "companySettings/co": {
      inventoryCategories: [
        { id: "watches", title: "Watches", icon: "⌚" },
        { id: "other", title: "Other", icon: "▪" }
      ]
    },
    [itemPath("i1")]: { category: "Watches", name: "Sub" },
    [itemPath("i2")]: { category: "Watches", name: "Speedy" },
    [itemPath("i3")]: { category: "Other", name: "Box" }
  });
  const result = await (call(fns.saveInventoryCategories, {
    categories: [
      { id: "watches", title: "Complete Watches", icon: "⌚" },
      { id: "other", title: "Other", icon: "▪" }
    ]
  }));
  assert.strictEqual(result.renamedItems, 2);
  assert.strictEqual(store.get(itemPath("i1")).category, "Complete Watches");
  assert.strictEqual(store.get(itemPath("i2")).category, "Complete Watches");
  assert.strictEqual(store.get(itemPath("i3")).category, "Other", "an unrelated category is untouched");
  pass("renaming a category renames it on its items");
}

// 4. Two categories cannot share a name — that is a merge, and the error says so.
{
  const { fns } = build({});
  await assert.rejects(
    call(fns.saveInventoryCategories, {
      categories: [{ id: "a", title: "Straps" }, { id: "b", title: "straps" }, { id: "c", title: "Other" }]
    }),
    /Merge them instead/
  );
  pass("duplicate names are refused, with the fix named");
}

// 5. THE rule: a category holding items is never deleted silently.
{
  const seed = {
    "companySettings/co": {
      inventoryCategories: [
        { id: "dials", title: "Dials", icon: "◎" },
        { id: "parts", title: "Parts", icon: "⚒" },
        { id: "other", title: "Other", icon: "▪" }
      ]
    },
    [itemPath("i1")]: { category: "Dials", name: "Black dial" },
    [itemPath("i2")]: { category: "Dials", name: "White dial" }
  };

  // a) No disposition → refused, and the message lists the ways out.
  {
    const { fns } = build(seed);
    await assert.rejects(
      call(fns.deleteInventoryCategory, { categoryId: "dials" }),
      /still holds 2 items.*Move them, archive the category, or send them to Other/s
    );
  }

  // b) Move → the items land in the chosen category.
  {
    const { fns, store } = build(seed);
    const out = await (call(fns.deleteInventoryCategory, { categoryId: "dials", disposition: "move", moveToId: "parts" }));
    assert.strictEqual(out.itemsMoved, 2);
    assert.strictEqual(store.get(itemPath("i1")).category, "Parts");
    assert(!out.categories.some(c => c.id === "dials"));
  }

  // c) Archive → the category leaves the sidebar but the items keep their word.
  {
    const { fns, store } = build(seed);
    const out = await (call(fns.deleteInventoryCategory, { categoryId: "dials", disposition: "archive" }));
    assert.strictEqual(out.archived, true);
    assert.strictEqual(out.categories.find(c => c.id === "dials").archived, true);
    assert.strictEqual(store.get(itemPath("i1")).category, "Dials", "archiving does not touch the items");
  }

  // d) Other → the fallback catches them.
  {
    const { fns, store } = build(seed);
    const out = await (call(fns.deleteInventoryCategory, { categoryId: "dials", disposition: "other" }));
    assert.strictEqual(out.itemsMoved, 2);
    assert.strictEqual(store.get(itemPath("i1")).category, "Other");
  }
  pass("a category with items cannot be dropped on the floor");
}

// 6. An empty category deletes cleanly with no ceremony.
{
  const { fns } = build({
    "companySettings/co": {
      inventoryCategories: [{ id: "tools", title: "Tools" }, { id: "other", title: "Other" }]
    }
  });
  const out = await (call(fns.deleteInventoryCategory, { categoryId: "tools" }));
  assert.strictEqual(out.itemsMoved, 0);
  assert.deepStrictEqual(out.categories.map(c => c.id), ["other"]);
  pass("an empty category deletes without a prompt");
}

// 7. Merge is the workshop's own request — "Bracelets into Straps".
{
  const { fns, store } = build({
    "companySettings/co": {
      inventoryCategories: [
        { id: "bracelets", title: "Bracelets" },
        { id: "straps", title: "Straps" },
        { id: "other", title: "Other" }
      ],
      inventoryDefaultCategory: "Bracelets"
    },
    [itemPath("i1")]: { category: "Bracelets", name: "Jubilee" },
    [itemPath("i2")]: { category: "Straps", name: "Leather" }
  });
  const out = await (call(fns.mergeInventoryCategories, { fromId: "bracelets", intoId: "straps" }));
  assert.strictEqual(out.itemsMoved, 1);
  assert.strictEqual(out.into, "Straps");
  assert.strictEqual(store.get(itemPath("i1")).category, "Straps");
  assert(!out.categories.some(c => c.id === "bracelets"));
  // A default pointing at the category that just vanished would break the form.
  assert.strictEqual(store.get("companySettings/co").inventoryDefaultCategory, "Straps");
  pass("merging moves the items and rescues the default");
}

// 8. Orphans are surfaced, not hidden: an item whose category was removed
// outside this flow (a CSV import, an older client) must still be findable.
{
  const { fns } = build({
    "companySettings/co": { inventoryCategories: [{ id: "other", title: "Other" }] },
    [itemPath("i1")]: { category: "Gemstones", name: "Sapphire" },
    [itemPath("i2")]: { category: "Other", name: "Box" }
  });
  const out = await (call(fns.listInventoryCategories, {}));
  assert.deepStrictEqual(out.orphans, [{ title: "Gemstones", itemCount: 1 }]);
  assert.strictEqual(out.categories.find(c => c.title === "Other").itemCount, 1);
  pass("items in a vanished category are reported, not lost");
}

// 9. The list callable serves the workspace's categories, not the old constant.
{
  const { fns } = build({
    "companySettings/co": {
      inventoryCategories: [
        { id: "gem", title: "Gemstones", icon: "◇" },
        { id: "hidden", title: "Retired", archived: true },
        { id: "other", title: "Other" }
      ],
      inventoryDefaultCategory: "Gemstones"
    }
  });
  const out = await (call(fns.listInventoryItems, {}));
  assert.deepStrictEqual(out.categories, ["Gemstones", "Other"], "archived categories leave the picker");
  assert.strictEqual(out.defaultCategory, "Gemstones");
  assert.strictEqual(out.categoryDetails.length, 3, "the editor still sees the archived one");
  pass("the item list serves the workspace's own categories");
}

  console.log("\n✅ INVENTORY CATEGORIES GEÇTİ");
}

main().catch(error => { console.error("\n❌", error.message); process.exit(1); });
