"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { arrayUnion, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  language: string;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, language: "English" });

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function ensurePersonalWorkspace(currentUser: User) {
  const uid = currentUser.uid;
  const email = currentUser.email ?? "";
  const displayName = currentUser.displayName ?? "";
  const photoURL = currentUser.photoURL ?? "";
  const userRef = doc(db, "users", uid);
  const companyRef = doc(db, "companies", uid);
  const [userSnapshot, companySnapshot] = await Promise.all([getDoc(userRef), getDoc(companyRef)]);
  const userData = userSnapshot.exists() ? userSnapshot.data() : {};
  const userPayload: Record<string, unknown> = {
    uid,
    email,
    displayName,
    photoURL,
    updatedAt: serverTimestamp()
  };
  if (!cleanText(userData.activeCompanyId)) userPayload.activeCompanyId = uid;
  await setDoc(userRef, userPayload, { merge: true });

  const ownerMember = {
    uid,
    email,
    displayName,
    photoURL,
    role: "owner",
    updatedAt: serverTimestamp()
  };

  if (companySnapshot.exists()) {
    const data = companySnapshot.data();
    const members = data.members && typeof data.members === "object" && !Array.isArray(data.members)
      ? data.members as Record<string, unknown>
      : {};
    const companyPayload: Record<string, unknown> = {
      companyId: uid,
      appName: "NivaDesk",
      memberUids: arrayUnion(uid),
      memberRoles: { [uid]: "owner" },
      updatedAt: serverTimestamp()
    };
    if (!cleanText(data.ownerUid)) companyPayload.ownerUid = uid;
    if (!cleanText(data.ownerEmail)) companyPayload.ownerEmail = email;
    if (!cleanText(data.ownerDisplayName)) companyPayload.ownerDisplayName = displayName;
    if (!cleanText(data.ownerPhotoURL)) companyPayload.ownerPhotoURL = photoURL;
    if (!members[uid]) companyPayload.members = { [uid]: ownerMember };
    await setDoc(companyRef, companyPayload, { merge: true });
    return;
  }

  await setDoc(companyRef, {
    companyId: uid,
    ownerUid: uid,
    ownerEmail: email,
    ownerDisplayName: displayName,
    ownerPhotoURL: photoURL,
    appName: "NivaDesk",
    memberUids: arrayUnion(uid),
    memberRoles: { [uid]: "owner" },
    members: { [uid]: ownerMember },
    name: "My Studio",
    companyName: "My Studio",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    billingPlan: "demo",
    billingPlanName: "Free Demo",
    billingPlanSource: "new_workspace_default",
    billingStorageLimitMB: 50,
    billingTeamMemberLimit: 1
  }, { merge: true });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<string>("English");

  // Listen to the active workspace's selectedLanguage so children re-render on language change.
  useEffect(() => {
    if (!user) { setLanguage("English"); return; }
    const ref = doc(db, "companySettings", user.uid);
    const unsubscribe = onSnapshot(ref, snapshot => {
      const raw = snapshot.exists() ? (snapshot.data() as Record<string, unknown>)?.["seciliDil"] : undefined;
      const cleaned = typeof raw === "string" ? raw.trim() : "";
      setLanguage(cleaned || "English");
    }, () => setLanguage("English"));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    let authRun = 0;
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      const run = ++authRun;
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      ensurePersonalWorkspace(currentUser)
        .catch(error => {
          console.warn("Could not ensure NivaDesk workspace for signed-in user.", error);
        })
        .finally(() => {
          if (!cancelled && run === authRun) {
            setUser(currentUser);
            setLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ user, loading, language }), [user, loading, language]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
