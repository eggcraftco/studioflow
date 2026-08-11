// Shopify session persistence in Firestore (shopifySessions collection).
//
// Replaces the template's Prisma/SQLite storage: Cloud Run instances are
// stateless, so sessions must live in a shared store. The `shop` field is
// what the shop/redact GDPR handler uses to purge a store's sessions.
import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { firestore } from "./firestore.server";

const COLLECTION = "shopifySessions";

type StoredSession = Record<string, unknown> & { expires?: number | null };

function toSession(data: StoredSession): Session {
  const { expires, ...rest } = data;
  return new Session({
    ...(rest as ConstructorParameters<typeof Session>[0]),
    expires: typeof expires === "number" ? new Date(expires) : undefined,
  });
}

export class FirestoreSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const data = session.toObject();
    await firestore
      .collection(COLLECTION)
      .doc(session.id)
      .set({
        ...data,
        shop: session.shop,
        expires: session.expires ? session.expires.getTime() : null,
      });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const snap = await firestore.collection(COLLECTION).doc(id).get();
    if (!snap.exists) return undefined;
    return toSession(snap.data() as StoredSession);
  }

  async deleteSession(id: string): Promise<boolean> {
    await firestore.collection(COLLECTION).doc(id).delete();
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (!ids.length) return true;
    const batch = firestore.batch();
    for (const id of ids) batch.delete(firestore.collection(COLLECTION).doc(id));
    await batch.commit();
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const snap = await firestore.collection(COLLECTION).where("shop", "==", shop).get();
    return snap.docs.map((doc) => toSession(doc.data() as StoredSession));
  }
}
