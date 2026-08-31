// A file uploaded to an order has to be in the library. Immediately.
//
// It was not. The only thing that turned an order's client file into a library
// record was indexWorkspaceFilesIntoLibrary — a button on the web Files page
// that rescans the whole workspace. It is not scheduled, and Mac, iPhone and
// Android do not offer it at all. So a file uploaded from a phone was not in
// the library; neither was one uploaded from the web order card, which is
// where most files arrive. The library's promise is "find a document without
// knowing which order it belongs to", and it was quietly not keeping it.
//
// Registration now happens on the server inside appendClientFile, which is why
// this test drives THAT rather than the library callables: the fix has to work
// for the app versions already on people's phones, and those only call
// appendClientFile.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "eggcraft-studio";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const fns = require("../../index.js");
const db = admin.firestore();

const companyId = "qa-workspace";
const orderId = "QA-ORDER-1";
const auth = { uid: "qa-review-uid", token: { email: "review@nivadesk.app", name: "QA Review" } };

let fail = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  <- " + extra}`);
};

const records = () => db.collection("companies").doc(companyId).collection("fileRecords");
const upload = (file) => fns.appendClientFile.run({
  data: { companyId, orderId, fileId: file.id, fileSizeBytes: file.fileSize, clientFile: file },
  auth, acceptsStreaming: false
});

// Shaped the way a phone actually sends it: appendClientFile runs this through
// safeClientFileMetadata, which requires a download URL and renames fileType to
// contentType before the library ever sees it.
const mkFile = (id, name, path) => ({
  id, fileName: name, storagePath: path,
  downloadURL: `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(path)}?alt=media&token=t`,
  contentType: "image/jpeg", fileSize: 4096,
  uploadedByEmail: "review@nivadesk.app",
  source: "iphone", note: "", isPendingUpload: false, localFilePath: "", pendingQueueId: ""
});

const PATH_A = `companies/${companyId}/client_files/${orderId}/ring.jpg`;
await upload(mkFile("cf-a", "ring.jpg", PATH_A));

let all = await records().get();
ok("a phone upload creates a library record", all.size === 1, `kayit sayisi=${all.size}`);
const rec = all.docs[0]?.data() || {};
ok("it points back at the order", (rec.links || []).some((l) => l.kind === "order" && l.id === orderId), JSON.stringify(rec.links));
ok("it carries the file name", rec.fileName === "ring.jpg", rec.fileName);
ok("it is marked as a client file", rec.source === "clientFile", rec.source);
// The assertion this test was missing the first time round. It passed while
// every phone upload was being stored with no content type, because the
// normaliser calls the field contentType and the library was reading fileType.
ok("it keeps the content type", rec.fileType === "image/jpeg", JSON.stringify(rec.fileType));
ok("the order link is team-only, not shared with the customer", (rec.links || [])[0]?.audience === "team", JSON.stringify(rec.links));
ok("it is not in the trash", Number(rec.trashedAtMs || 0) === 0, String(rec.trashedAtMs));

// The record shape has to match what indexWorkspaceFilesIntoLibrary writes,
// or the collection ends up with two kinds of record from two functions
// nobody thinks to compare.
ok("uses activeVersionIndex, as the indexer does", rec.activeVersionIndex === 0, JSON.stringify(Object.keys(rec)));
ok("the version entry uses uploadedAtMs", Number(rec.versions?.[0]?.uploadedAtMs) > 0, JSON.stringify(rec.versions));
ok("it records an activity entry", Array.isArray(rec.activity) && rec.activity.length === 1, JSON.stringify(rec.activity));

// Re-uploading the same object must not make a second record.
await upload(mkFile("cf-a", "ring.jpg", PATH_A));
all = await records().get();
ok("re-uploading the same file does not duplicate", all.size === 1, `kayit sayisi=${all.size}`);
ok("nor does it duplicate the order link",
  ((all.docs[0].data().links) || []).filter((l) => l.kind === "order" && l.id === orderId).length === 1,
  JSON.stringify(all.docs[0].data().links));

// A second, different file is a second record.
await upload(mkFile("cf-b", "band.jpg", `companies/${companyId}/client_files/${orderId}/band.jpg`));
all = await records().get();
ok("a second file is a second record", all.size === 2, `kayit sayisi=${all.size}`);

// The indexer must agree it has nothing left to do — if it creates records for
// files the upload path already registered, they disagree about the doc id.
const indexed = await fns.indexWorkspaceFilesIntoLibrary.run({ data: { companyId }, auth, acceptsStreaming: false });
ok("the index button finds nothing new to create", Number(indexed?.created || 0) === 0, JSON.stringify(indexed));
all = await records().get();
ok("and does not duplicate anything", all.size === 2, `kayit sayisi=${all.size}`);

console.log(fail ? `\n${fail} FAILED` : "\nPASS");
process.exit(fail ? 1 : 0);
