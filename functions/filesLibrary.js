"use strict";

// The central file library. One rule carries the whole design, straight from
// the review that demanded it:
//
//   A FILE IS UPLOADED ONCE. Everything else is a LINK.
//
// Data model (server-written only; the collection is excluded from the client
// catch-all in firestore.rules):
//   companies/{companyId}/fileRecords/{fileId}
//
// Decisions worth defending later:
//
// 1. THE RECORD ID IS THE HASH OF THE ORIGINAL STORAGE PATH.
//    sha1(storagePath) makes indexing idempotent: re-running the indexer over
//    a workspace's existing client files, inventory photos and bank receipts
//    can never mint duplicates. New versions append to the record; the id
//    keeps pointing at the file's identity, not at any one byte-copy of it.
//
// 2. THE REGISTRY SITS OVER THE EXISTING STORAGE, IT DOES NOT MOVE IT.
//    Client files, inventory photos and bank receipts stay exactly where their
//    features put them — same paths, same storage rules, same access. The
//    library records what exists and how it is connected. Deleting a record
//    therefore never deletes a storage object it did not originate: only
//    files uploaded THROUGH the library (source "library") are removed from
//    storage on hard delete.
//
// 3. LINKING IS NOT SHARING.
//    An inventory item reserved for an order does NOT hand its invoices to the
//    customer. Portal visibility lives per ORDER-LINK, set only by the explicit
//    share flow, and defaults to off. Bank receipts and purchase invoices index
//    as internal; nothing this module does can flip a file to portal-visible
//    except shareLibraryFileWithOrder with visibility "portal".

const crypto = require("crypto");

const REGION = "europe-west2";
const LINK_KINDS = ["order", "inventoryItem", "purchase", "bankTransaction", "supplier"];
const ACTIVITY_CAP = 40;
const VERSION_CAP = 20;
const LINK_CAP = 24;

// A portal visitor has no Firebase session, so a portal-shared file needs a
// token URL — the same mechanism the estimate signature uses. The token is
// minted (or reused) on the object's metadata; failure degrades to "" and the
// share itself still succeeds.
async function ensurePortalUrl(admin, storagePath) {
  const path = String(storagePath || "").trim();
  if (!path) return "";
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    const [meta] = await file.getMetadata();
    let token = String(((meta || {}).metadata || {}).firebaseStorageDownloadTokens || "").split(",")[0].trim();
    if (!token) {
      token = crypto.randomUUID();
      await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch {
    return "";
  }
}

function createFilesLibraryFunctions({ admin, onCall, HttpsError, requireWorkspace, cleanText }) {
  const db = () => admin.firestore();
  const recordsRef = (companyId) =>
    db().collection("companies").doc(String(companyId)).collection("fileRecords");

  const clean = (value, fallback = "", max = 240) => cleanText(value, fallback, max);

  function fileIdForPath(storagePath) {
    return crypto.createHash("sha1").update(String(storagePath)).digest("hex");
  }

  function assertCompanyPath(companyId, storagePath) {
    const prefix = `companies/${companyId}/`;
    if (!String(storagePath).startsWith(prefix)) {
      throw new HttpsError("invalid-argument", "The file path does not belong to this workspace.");
    }
  }

  function linkKey(kind, id) {
    return `${kind}:${id}`;
  }

  function activityEntry(email, action, detail = "") {
    return { atMs: Date.now(), byEmail: String(email || ""), action: clean(action, "", 60), detail: clean(detail, "", 200) };
  }

  function pushActivity(existing, entry) {
    const list = Array.isArray(existing) ? existing.slice(0, ACTIVITY_CAP - 1) : [];
    return [entry, ...list];
  }

  function cleanLink(raw) {
    const kind = String(raw && raw.kind || "");
    const id = clean(raw && raw.id, "", 200);
    if (!LINK_KINDS.includes(kind) || !id) return null;
    return {
      kind,
      id,
      label: clean(raw && raw.label, "", 160),
      audience: ["team", "portal", "internal"].includes(String(raw && raw.audience)) ? String(raw.audience) : "team",
      displayName: clean(raw && raw.displayName, "", 160),
      addedAtMs: Number(raw && raw.addedAtMs) || Date.now(),
      addedByEmail: clean(raw && raw.addedByEmail, "", 120)
    };
  }

  function derived(links) {
    return {
      linkKinds: Array.from(new Set(links.map((row) => row.kind))),
      linkKeys: Array.from(new Set(links.map((row) => linkKey(row.kind, row.id)))),
      clientPortalVisible: links.some((row) => row.kind === "order" && row.audience === "portal")
    };
  }

  // Every link must point at a real record of this workspace: a link is a
  // claim, and the server does not store claims it has not checked.
  async function assertLinkTarget(companyId, kind, id) {
    const roots = {
      order: db().collection("siparisler").doc(id),
      inventoryItem: db().collection("companies").doc(companyId).collection("inventoryItems").doc(id),
      purchase: db().collection("companies").doc(companyId).collection("purchases").doc(id),
      bankTransaction: db().collection("companies").doc(companyId).collection("bankTransactions").doc(id),
      supplier: db().collection("companies").doc(companyId).collection("suppliers").doc(id)
    };
    const snap = await roots[kind].get();
    if (!snap.exists) throw new HttpsError("not-found", "The linked record no longer exists.");
    if (kind === "order" && String((snap.data() || {}).companyId || "") !== companyId) {
      throw new HttpsError("permission-denied", "That order belongs to another workspace.");
    }
    return snap.data() || {};
  }

  function recordView(id, data) {
    const versions = Array.isArray(data.versions) ? data.versions : [];
    const activeIndex = Number.isInteger(data.activeVersionIndex) && data.activeVersionIndex >= 0 && data.activeVersionIndex < versions.length
      ? data.activeVersionIndex
      : Math.max(0, versions.length - 1);
    return {
      id,
      fileName: String(data.fileName || ""),
      displayName: String(data.displayName || data.fileName || ""),
      fileType: String(data.fileType || ""),
      fileSize: Number(data.fileSize) || 0,
      storagePath: String(data.storagePath || ""),
      source: String(data.source || "library"),
      links: Array.isArray(data.links) ? data.links : [],
      linkKinds: Array.isArray(data.linkKinds) ? data.linkKinds : [],
      clientPortalVisible: data.clientPortalVisible === true,
      tags: Array.isArray(data.tags) ? data.tags : [],
      versions,
      activeVersionIndex: activeIndex,
      activity: Array.isArray(data.activity) ? data.activity : [],
      trashedAtMs: Number(data.trashedAtMs) || 0,
      uploadedByEmail: String(data.uploadedByEmail || ""),
      createdAtMs: Number(data.createdAtMs) || 0,
      updatedAtMs: Number(data.updatedAtMs) || 0
    };
  }

  // -------------------------------------------------------------------------

  const listLibraryFiles = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
    const { companyId } = await requireWorkspace(request, { area: "clientFiles" });
    const linkKeyFilter = clean(request.data && request.data.linkKey, "", 240);
    const kindFilter = clean(request.data && request.data.kind, "", 40);
    const trashed = request.data && request.data.trashed === true;

    let query = recordsRef(companyId);
    if (linkKeyFilter) query = query.where("linkKeys", "array-contains", linkKeyFilter);
    else if (kindFilter && LINK_KINDS.includes(kindFilter)) query = query.where("linkKinds", "array-contains", kindFilter);
    const snap = await query.limit(1000).get();

    const files = [];
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const isTrashed = (Number(data.trashedAtMs) || 0) > 0;
      if (isTrashed !== trashed) return;
      files.push(recordView(doc.id, data));
    });
    files.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return { ok: true, files, capped: snap.size >= 1000 };
  });

  const registerLibraryFile = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const storagePath = clean(request.data && request.data.storagePath, "", 500);
    const fileName = clean(request.data && request.data.fileName, "", 200);
    if (!storagePath || !fileName) throw new HttpsError("invalid-argument", "storagePath and fileName are required.");
    assertCompanyPath(companyId, storagePath);

    const links = [];
    for (const raw of Array.isArray(request.data && request.data.links) ? request.data.links.slice(0, LINK_CAP) : []) {
      const link = cleanLink({ ...raw, addedByEmail: email, audience: "team" });
      if (!link) continue;
      await assertLinkTarget(companyId, link.kind, link.id);
      links.push(link);
    }

    const fileId = fileIdForPath(storagePath);
    const ref = recordsRef(companyId).doc(fileId);
    const existing = await ref.get();
    if (existing.exists) {
      return { ok: true, fileId, existed: true };
    }
    const now = Date.now();
    const version = {
      storagePath,
      fileName,
      fileSize: Math.max(0, Number(request.data && request.data.fileSize) || 0),
      uploadedAtMs: now,
      uploadedByEmail: String(email || ""),
      note: ""
    };
    await ref.set({
      companyId,
      storagePath,
      fileName,
      displayName: fileName,
      fileType: clean(request.data && request.data.fileType, "", 120),
      fileSize: version.fileSize,
      source: "library",
      links,
      ...derived(links),
      tags: [],
      versions: [version],
      activeVersionIndex: 0,
      activity: [activityEntry(email, "uploaded", fileName)],
      trashedAtMs: 0,
      uploadedByEmail: String(email || ""),
      createdAtMs: now,
      updatedAtMs: now
    });
    return { ok: true, fileId, existed: false };
  });

  async function mutateRecord(companyId, fileId, mutate) {
    const ref = recordsRef(companyId).doc(clean(fileId, "", 80));
    return db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "File record not found.");
      const data = snap.data() || {};
      const updates = mutate(data);
      tx.set(ref, { ...updates, updatedAtMs: Date.now() }, { merge: true });
      return { ...data, ...updates };
    });
  }

  const renameLibraryFile = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const displayName = clean(request.data && request.data.displayName, "", 160);
    if (!displayName) throw new HttpsError("invalid-argument", "displayName is required.");
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => ({
      displayName,
      activity: pushActivity(data.activity, activityEntry(email, "renamed", displayName))
    }));
    return { ok: true };
  });

  const linkLibraryFile = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const link = cleanLink({ ...request.data, addedByEmail: email });
    if (!link) throw new HttpsError("invalid-argument", "A valid kind and id are required.");
    await assertLinkTarget(companyId, link.kind, link.id);
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => {
      const links = (Array.isArray(data.links) ? data.links : [])
        .filter((row) => !(row.kind === link.kind && row.id === link.id));
      if (links.length >= LINK_CAP) throw new HttpsError("failed-precondition", "This file already has the maximum number of links.");
      links.push(link);
      return {
        links,
        ...derived(links),
        activity: pushActivity(data.activity, activityEntry(email, "linked", linkKey(link.kind, link.id)))
      };
    });
    return { ok: true };
  });

  // Removing a link is NOT deleting the file — the review's rule, verbatim.
  const unlinkLibraryFile = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const kind = String(request.data && request.data.kind || "");
    const id = clean(request.data && request.data.id, "", 200);
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => {
      const links = (Array.isArray(data.links) ? data.links : [])
        .filter((row) => !(row.kind === kind && row.id === id));
      return {
        links,
        ...derived(links),
        activity: pushActivity(data.activity, activityEntry(email, "unlinked", linkKey(kind, id)))
      };
    });
    return { ok: true };
  });

  // The ONLY door to the client portal. Linking never shares; this does, and
  // says so in the record's own activity trail.
  const shareLibraryFileWithOrder = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const orderId = clean(request.data && request.data.orderId, "", 200);
    const audience = ["team", "portal", "internal"].includes(String(request.data && request.data.visibility))
      ? String(request.data.visibility)
      : "team";
    if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");
    const order = await assertLinkTarget(companyId, "order", orderId);
    const label = clean(`${order.customerName || ""} — ${order.designName || ""}`, "", 160);
    const displayName = clean(request.data && request.data.displayName, "", 160);
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => {
      const links = (Array.isArray(data.links) ? data.links : [])
        .filter((row) => !(row.kind === "order" && row.id === orderId));
      links.push({
        kind: "order", id: orderId, label, audience, displayName,
        addedAtMs: Date.now(), addedByEmail: String(email || "")
      });
      return {
        links,
        ...derived(links),
        activity: pushActivity(data.activity, activityEntry(
          email,
          audience === "portal" ? "shared to portal" : audience === "internal" ? "linked internal-only" : "shared with order team",
          label
        ))
      };
    });
    if (audience === "portal") {
      const ref = recordsRef(companyId).doc(clean(request.data && request.data.fileId, "", 80));
      const snap = await ref.get();
      const portalUrl = await ensurePortalUrl(admin, (snap.data() || {}).storagePath);
      if (portalUrl) await ref.set({ portalUrl }, { merge: true });
    }
    return { ok: true };
  });

  // Trash and hard delete additionally require the per-member delete access —
  // the same gate the classic client-files delete honors.
  const trashLibraryFile = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true, destroy: true });
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => ({
      trashedAtMs: Date.now(),
      activity: pushActivity(data.activity, activityEntry(email, "moved to trash"))
    }));
    return { ok: true };
  });

  const restoreLibraryFile = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => ({
      trashedAtMs: 0,
      activity: pushActivity(data.activity, activityEntry(email, "restored from trash"))
    }));
    return { ok: true };
  });

  // Hard delete: trash first, always. The record dies; the storage object dies
  // ONLY if the library itself put it there — indexed files belong to their
  // original features and are never destroyed from here.
  const deleteLibraryFile = onCall({ region: REGION }, async (request) => {
    const { companyId } = await requireWorkspace(request, { area: "clientFiles", write: true, destroy: true });
    const fileId = clean(request.data && request.data.fileId, "", 80);
    const ref = recordsRef(companyId).doc(fileId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "File record not found.");
    const data = snap.data() || {};
    if (!(Number(data.trashedAtMs) || 0)) {
      throw new HttpsError("failed-precondition", "Move the file to trash first.");
    }
    if (String(data.source) === "library") {
      for (const version of Array.isArray(data.versions) ? data.versions : []) {
        const path = String(version.storagePath || "");
        if (!path.startsWith(`companies/${companyId}/`)) continue;
        try {
          await admin.storage().bucket().file(path).delete();
        } catch {
          /* already gone is fine */
        }
      }
    }
    await ref.delete();
    return { ok: true, storageDeleted: String(data.source) === "library" };
  });

  const addLibraryFileVersion = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const storagePath = clean(request.data && request.data.storagePath, "", 500);
    const fileName = clean(request.data && request.data.fileName, "", 200);
    if (!storagePath || !fileName) throw new HttpsError("invalid-argument", "storagePath and fileName are required.");
    assertCompanyPath(companyId, storagePath);
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => {
      const versions = Array.isArray(data.versions) ? data.versions.slice(0, VERSION_CAP - 1) : [];
      versions.push({
        storagePath,
        fileName,
        fileSize: Math.max(0, Number(request.data && request.data.fileSize) || 0),
        uploadedAtMs: Date.now(),
        uploadedByEmail: String(email || ""),
        note: clean(request.data && request.data.note, "", 160)
      });
      return {
        versions,
        activeVersionIndex: versions.length - 1,
        storagePath,
        fileName,
        fileSize: Math.max(0, Number(request.data && request.data.fileSize) || 0),
        activity: pushActivity(data.activity, activityEntry(email, "new version", fileName))
      };
    });
    await refreshPortalUrlIfShared(companyId, request.data && request.data.fileId);
    return { ok: true };
  });

  const setLibraryFileActiveVersion = onCall({ region: REGION }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const index = Number(request.data && request.data.index);
    await mutateRecord(companyId, request.data && request.data.fileId, (data) => {
      const versions = Array.isArray(data.versions) ? data.versions : [];
      if (!Number.isInteger(index) || index < 0 || index >= versions.length) {
        throw new HttpsError("invalid-argument", "No such version.");
      }
      const version = versions[index];
      return {
        activeVersionIndex: index,
        storagePath: String(version.storagePath || data.storagePath || ""),
        fileName: String(version.fileName || data.fileName || ""),
        fileSize: Number(version.fileSize) || 0,
        activity: pushActivity(data.activity, activityEntry(email, "active version changed", `v${index + 1}`))
      };
    });
    await refreshPortalUrlIfShared(companyId, request.data && request.data.fileId);
    return { ok: true };
  });

  // The portal URL always points at the ACTIVE version; changing versions on a
  // portal-shared file re-mints it so the customer never downloads stale bytes.
  async function refreshPortalUrlIfShared(companyId, rawFileId) {
    const fileId = clean(rawFileId, "", 80);
    if (!fileId) return;
    const ref = recordsRef(companyId).doc(fileId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() || {} : {};
    if (data.clientPortalVisible !== true) return;
    const portalUrl = await ensurePortalUrl(admin, data.storagePath);
    if (portalUrl) await ref.set({ portalUrl }, { merge: true });
  }

  // Builds the registry over what already exists: order client files, inventory
  // photos and bank receipts. Idempotent by construction — sha1(path) ids mean
  // running it twice creates nothing twice; links are refreshed additively.
  // A bank receipt whose transaction is matched to a purchase links to the
  // purchase AND to every item that purchase created: the review's invoice.pdf
  // example, produced automatically.
  const indexWorkspaceFilesIntoLibrary = onCall({ region: REGION, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
    const { companyId, email } = await requireWorkspace(request, { area: "clientFiles", write: true });
    const now = Date.now();
    let created = 0;
    let refreshed = 0;
    const writer = db().bulkWriter();

    async function upsert(storagePath, fields, newLinks) {
      const fileId = fileIdForPath(storagePath);
      const ref = recordsRef(companyId).doc(fileId);
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data() || {};
        const links = Array.isArray(data.links) ? data.links.slice() : [];
        let changed = false;
        for (const link of newLinks) {
          if (!links.some((row) => row.kind === link.kind && row.id === link.id)) {
            links.push(link);
            changed = true;
          }
        }
        if (changed && links.length <= LINK_CAP) {
          writer.set(ref, { links, ...derived(links), updatedAtMs: now }, { merge: true });
          refreshed += 1;
        }
        return;
      }
      writer.set(ref, {
        companyId,
        storagePath,
        ...fields,
        links: newLinks,
        ...derived(newLinks),
        tags: [],
        versions: [{
          storagePath,
          fileName: fields.fileName,
          fileSize: fields.fileSize,
          uploadedAtMs: fields.createdAtMs || now,
          uploadedByEmail: fields.uploadedByEmail || "",
          note: ""
        }],
        activeVersionIndex: 0,
        activity: [activityEntry(email, "indexed", fields.source)],
        trashedAtMs: 0,
        createdAtMs: fields.createdAtMs || now,
        updatedAtMs: now
      });
      created += 1;
    }

    const mkLink = (kind, id, label) => ({
      kind, id: String(id), label: clean(label, "", 160), audience: "team",
      displayName: "", addedAtMs: now, addedByEmail: String(email || "")
    });

    // 1. Order client files.
    const orders = await db().collection("siparisler").where("companyId", "==", companyId).limit(2000).get();
    for (const doc of orders.docs) {
      const order = doc.data() || {};
      const label = `${order.customerName || ""} — ${order.designName || ""}`;
      for (const file of Array.isArray(order.clientFiles) ? order.clientFiles : []) {
        const path = String(file && (file.storagePath || file.path) || "");
        if (!path.startsWith(`companies/${companyId}/`)) continue;
        await upsert(path, {
          fileName: clean(file.fileName || file.name, "file", 200),
          displayName: clean(file.fileName || file.name, "file", 200),
          fileType: clean(file.fileType, "", 120),
          fileSize: Math.max(0, Number(file.fileSize) || 0),
          source: "clientFile",
          uploadedByEmail: clean(file.uploadedByEmail || file.uploadedBy, "", 120),
          createdAtMs: Number(file.uploadedAtMs) || now
        }, [mkLink("order", doc.id, label)]);
      }
    }

    // 2. Inventory photos — linked to their item, and to the purchase that
    //    brought the item in, when there is one.
    const items = await db().collection("companies").doc(companyId).collection("inventoryItems").limit(2000).get();
    for (const doc of items.docs) {
      const item = doc.data() || {};
      const links = [mkLink("inventoryItem", doc.id, `${item.number || ""} ${item.name || ""}`.trim())];
      if (item.purchaseId) links.push(mkLink("purchase", String(item.purchaseId), String(item.purchaseNumber || "")));
      for (const path of Array.isArray(item.photos) ? item.photos : []) {
        if (!String(path).startsWith(`companies/${companyId}/`)) continue;
        await upsert(String(path), {
          fileName: clean(String(path).split("/").pop(), "photo", 200),
          displayName: clean(`${item.name || "Item"} — photo`, "photo", 160),
          fileType: "image",
          fileSize: 0,
          source: "inventoryPhoto",
          uploadedByEmail: "",
          createdAtMs: Number(item.createdAtMs) || now
        }, links);
      }
    }

    // 3. Bank receipts — the review's own example: one invoice, linked to the
    //    transaction, its matched purchase, and that purchase's items.
    const txs = await db().collection("companies").doc(companyId).collection("bankTransactions").limit(2000).get();
    for (const doc of txs.docs) {
      const tx = doc.data() || {};
      const path = String(tx.receiptPath || "");
      if (!path.startsWith(`companies/${companyId}/`)) continue;
      const links = [mkLink("bankTransaction", doc.id, clean(tx.counterparty || tx.description, "", 120))];
      if (tx.purchaseId) {
        links.push(mkLink("purchase", String(tx.purchaseId), ""));
        try {
          const purchaseSnap = await db().collection("companies").doc(companyId)
            .collection("purchases").doc(String(tx.purchaseId)).get();
          const purchase = purchaseSnap.exists ? purchaseSnap.data() || {} : {};
          if (purchase.supplierName) links[links.length - 1].label = clean(`${purchase.number || ""} · ${purchase.supplierName}`, "", 160);
          for (const itemId of (Array.isArray(purchase.itemIds) ? purchase.itemIds : []).slice(0, 12)) {
            links.push(mkLink("inventoryItem", String(itemId), ""));
          }
        } catch {
          /* purchase gone — the tx link stands alone */
        }
      }
      await upsert(path, {
        fileName: clean(tx.receiptName || path.split("/").pop(), "receipt", 200),
        displayName: clean(tx.receiptName, "receipt", 160) || clean(path.split("/").pop(), "receipt", 200),
        fileType: "receipt",
        fileSize: 0,
        source: "bankReceipt",
        uploadedByEmail: "",
        createdAtMs: now
      }, links);
    }

    await writer.close();
    return {
      ok: true,
      created,
      refreshed,
      scanned: { orders: orders.size, inventoryItems: items.size, bankTransactions: txs.size }
    };
  });

  return {
    listLibraryFiles,
    registerLibraryFile,
    renameLibraryFile,
    linkLibraryFile,
    unlinkLibraryFile,
    shareLibraryFileWithOrder,
    trashLibraryFile,
    restoreLibraryFile,
    deleteLibraryFile,
    addLibraryFileVersion,
    setLibraryFileActiveVersion,
    indexWorkspaceFilesIntoLibrary
  };
}

// What the sessionless customer portal may see of the library: only files
// whose ORDER link was explicitly shared with audience "portal", never
// trashed ones, each under the name the workshop chose to show. Files whose
// storage object cannot mint a URL are omitted rather than listed dead.
function createPortalFilesHelper({ admin }) {
  return async function portalFilesForOrder(companyId, orderId) {
    const company = String(companyId || "").trim();
    const order = String(orderId || "").trim();
    if (!company || !order) return [];
    const snap = await admin.firestore()
      .collection("companies").doc(company).collection("fileRecords")
      .where("linkKeys", "array-contains", `order:${order}`)
      .limit(200)
      .get();
    const out = [];
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (Number(data.trashedAtMs || 0) > 0) continue;
      if (data.clientPortalVisible !== true) continue;
      const link = (Array.isArray(data.links) ? data.links : [])
        .find((row) => row && row.kind === "order" && row.id === order && row.audience === "portal");
      if (!link) continue;
      let url = String(data.portalUrl || "");
      if (!url) {
        url = await ensurePortalUrl(admin, data.storagePath);
        if (url) await doc.ref.set({ portalUrl: url }, { merge: true }).catch(() => undefined);
      }
      if (!url) continue;
      out.push({
        name: String(link.displayName || data.displayName || data.fileName || "File").slice(0, 160),
        url,
        fileType: String(data.fileType || "").slice(0, 100),
        fileSize: Math.max(0, Number(data.fileSize) || 0)
      });
      if (out.length >= 20) break;
    }
    return out;
  };
}

module.exports = { createFilesLibraryFunctions, createPortalFilesHelper };
