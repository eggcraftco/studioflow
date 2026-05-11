#!/usr/bin/env node

/**
 * One-time Firestore migration for StudioFlow / EGGcraft Studio Manager.
 *
 * Copies old development data from:
 *   companyId = test_studio_123
 *
 * to the new authenticated user/company:
 *   companyId = iZFBJqrTJfUBVPA4BgKyvg9zV9o1
 *
 * This script DOES NOT delete old data.
 *
 * Usage:
 *   node migrate_test_studio_to_user.js
 *   MIGRATE_CONFIRM=yes node migrate_test_studio_to_user.js
 *
 * Optional:
 *   OVERWRITE_SETTINGS=yes MIGRATE_CONFIRM=yes node migrate_test_studio_to_user.js
 */

const admin = require("firebase-admin");

const PROJECT_ID = process.env.FIREBASE_PROJECT || process.env.GCLOUD_PROJECT || "eggcraft-studio";
const SOURCE_COMPANY_ID = process.env.SOURCE_COMPANY_ID || "test_studio_123";
const TARGET_COMPANY_ID = process.env.TARGET_COMPANY_ID || "iZFBJqrTJfUBVPA4BgKyvg9zV9o1";
const CONFIRM = process.env.MIGRATE_CONFIRM === "yes";
const OVERWRITE_SETTINGS = process.env.OVERWRITE_SETTINGS === "yes";

admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

let batch = db.batch();
let batchCount = 0;

const stats = {
  ordersFound: 0,
  ordersCopied: 0,
  ordersSkipped: 0,
  customersFound: 0,
  customersCopied: 0,
  customersSkipped: 0,
  settingsCopied: 0,
  settingsSkipped: 0,
  companyDocsCopied: 0,
  companyDocsSkipped: 0,
};

function migrationMeta() {
  return {
    companyId: TARGET_COMPANY_ID,
    migratedFromCompanyId: SOURCE_COMPANY_ID,
    migratedAt: FieldValue.serverTimestamp(),
  };
}

function copyDataWithNewCompanyId(data) {
  const copied = { ...data };

  if (!copied.companyId || copied.companyId === SOURCE_COMPANY_ID) {
    copied.companyId = TARGET_COMPANY_ID;
  }

  copied.migratedFromCompanyId = SOURCE_COMPANY_ID;
  copied.migratedAt = FieldValue.serverTimestamp();

  return copied;
}

async function queueSet(ref, data, options = {}) {
  if (!CONFIRM) return;

  batch.set(ref, data, options);
  batchCount += 1;

  if (batchCount >= 450) {
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  }
}

async function flushBatch() {
  if (CONFIRM && batchCount > 0) {
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  }
}

async function copyCompanyFilteredCollection(collectionName, foundKey, copiedKey, skippedKey) {
  const snap = await db
    .collection(collectionName)
    .where("companyId", "==", SOURCE_COMPANY_ID)
    .get();

  stats[foundKey] = snap.size;

  for (const sourceDoc of snap.docs) {
    const targetRef = db.collection(collectionName).doc(sourceDoc.id);
    const targetDoc = await targetRef.get();

    if (targetDoc.exists && targetDoc.data()?.companyId === TARGET_COMPANY_ID) {
      stats[skippedKey] += 1;
      console.log(`SKIP existing ${collectionName}/${sourceDoc.id}`);
      continue;
    }

    const data = copyDataWithNewCompanyId(sourceDoc.data());
    await queueSet(targetRef, data, { merge: false });
    stats[copiedKey] += 1;
    console.log(`${CONFIRM ? "COPY" : "DRY"} ${collectionName}/${sourceDoc.id}`);
  }
}

async function copyCompanySettings() {
  const sourceRef = db.collection("companySettings").doc(SOURCE_COMPANY_ID);
  const targetRef = db.collection("companySettings").doc(TARGET_COMPANY_ID);

  const sourceDoc = await sourceRef.get();
  if (!sourceDoc.exists) {
    console.log("No companySettings/test_studio_123 document found.");
    return;
  }

  const targetDoc = await targetRef.get();
  if (targetDoc.exists && !OVERWRITE_SETTINGS) {
    stats.settingsSkipped += 1;
    console.log("SKIP companySettings target already exists. Use OVERWRITE_SETTINGS=yes to copy old settings over it.");
    return;
  }

  const data = {
    ...sourceDoc.data(),
    ...migrationMeta(),
    settingsMigratedAt: FieldValue.serverTimestamp(),
  };

  await queueSet(targetRef, data, { merge: false });
  stats.settingsCopied += 1;
  console.log(`${CONFIRM ? "COPY" : "DRY"} companySettings/${SOURCE_COMPANY_ID} -> companySettings/${TARGET_COMPANY_ID}`);
}

async function copyDocumentTree(sourceRef, targetRef) {
  const sourceDoc = await sourceRef.get();

  if (sourceDoc.exists) {
    const targetDoc = await targetRef.get();

    if (targetDoc.exists) {
      stats.companyDocsSkipped += 1;
      console.log(`SKIP existing ${targetRef.path}`);
    } else {
      await queueSet(targetRef, copyDataWithNewCompanyId(sourceDoc.data()), { merge: false });
      stats.companyDocsCopied += 1;
      console.log(`${CONFIRM ? "COPY" : "DRY"} ${sourceRef.path} -> ${targetRef.path}`);
    }
  }

  const subcollections = await sourceRef.listCollections();

  for (const subcollection of subcollections) {
    const docs = await subcollection.get();

    for (const doc of docs.docs) {
      const nextSourceRef = subcollection.doc(doc.id);
      const nextTargetRef = targetRef.collection(subcollection.id).doc(doc.id);
      await copyDocumentTree(nextSourceRef, nextTargetRef);
    }
  }
}

async function main() {
  console.log("StudioFlow one-time migration");
  console.log("--------------------------------");
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Source companyId: ${SOURCE_COMPANY_ID}`);
  console.log(`Target companyId: ${TARGET_COMPANY_ID}`);
  console.log(`Mode: ${CONFIRM ? "WRITE" : "DRY RUN"}`);
  console.log("");

  if (!CONFIRM) {
    console.log("This is a dry run. No data will be written.");
    console.log("To actually copy data, run:");
    console.log("MIGRATE_CONFIRM=yes node migrate_test_studio_to_user.js");
    console.log("");
  }

  await copyCompanyFilteredCollection("siparisler", "ordersFound", "ordersCopied", "ordersSkipped");
  await copyCompanyFilteredCollection("musteriler", "customersFound", "customersCopied", "customersSkipped");
  await copyCompanySettings();

  const sourceCompanyRef = db.collection("companies").doc(SOURCE_COMPANY_ID);
  const targetCompanyRef = db.collection("companies").doc(TARGET_COMPANY_ID);
  await copyDocumentTree(sourceCompanyRef, targetCompanyRef);

  await flushBatch();

  console.log("");
  console.log("Migration summary");
  console.log("-----------------");
  console.log(JSON.stringify(stats, null, 2));

  if (!CONFIRM) {
    console.log("");
    console.log("Dry run finished. If the numbers look correct, run:");
    console.log("MIGRATE_CONFIRM=yes node migrate_test_studio_to_user.js");
  } else {
    console.log("");
    console.log("Migration finished. Old data was not deleted.");
    console.log("Close and reopen the app, then sign in again with the new account.");
  }
}

main().catch((error) => {
  console.error("Migration failed:");
  console.error(error);
  process.exit(1);
});
