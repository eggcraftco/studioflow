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
  theme: string;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, language: "English", theme: "System" });

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

  // Only write when something actually changed — this runs on every app open,
  // so unconditional writes would add latency and Firestore write costs.
  const userNeedsWrite =
    !userSnapshot.exists() ||
    cleanText(userData.email) !== email ||
    cleanText(userData.displayName) !== displayName ||
    cleanText(userData.photoURL) !== photoURL ||
    !cleanText(userData.activeCompanyId);
  if (userNeedsWrite) {
    const userPayload: Record<string, unknown> = {
      uid,
      email,
      displayName,
      photoURL,
      updatedAt: serverTimestamp()
    };
    if (!cleanText(userData.activeCompanyId)) userPayload.activeCompanyId = uid;
    // First bootstrap of a brand-new account: remember which device class it
    // was created on. The first-project guide opens only for desktop signups.
    if (!userSnapshot.exists() && !cleanText(userData.signupPlatform)) {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
      const isPhone = /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua) ||
        (typeof window !== "undefined" && window.innerWidth < 768);
      userPayload.signupPlatform = isPhone ? "mobile" : "desktop";
    }
    await setDoc(userRef, userPayload, { merge: true });
  }

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
    const memberUids = Array.isArray(data.memberUids) ? data.memberUids as unknown[] : [];
    const memberRoles = data.memberRoles && typeof data.memberRoles === "object" && !Array.isArray(data.memberRoles)
      ? data.memberRoles as Record<string, unknown>
      : {};

    const companyComplete =
      cleanText(data.companyId) === uid &&
      cleanText(data.appName) === "NivaDesk" &&
      memberUids.includes(uid) &&
      memberRoles[uid] === "owner" &&
      Boolean(cleanText(data.ownerUid)) &&
      Boolean(members[uid]);
    if (companyComplete) return;

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
  const [theme, setTheme] = useState<string>("System");

  // Live per-user language + theme sync. Language and theme are STRICTLY personal
  // for every role (owner included) — they live in the user's own
  // personalInterfaceSettings doc and never inherit the workspace-wide value, so a
  // member never sees the owner's language/theme. Also watches
  // `users/{uid}.activeCompanyId` and refreshes the page whenever the signed-in
  // user's active workspace changes server-side (e.g. when the owner approves their
  // join request and the Cloud Function points them at the newly joined workspace).
  useEffect(() => {
    if (!user) { setLanguage("English"); setTheme("System"); return; }

    let unsubPersonal: (() => void) | null = null;
    let lastSeenActiveCompanyId: string | null = null;

    const unsubUserDoc = onSnapshot(doc(db, "users", user.uid), snap => {
      const companyId = (snap.exists() ? cleanText((snap.data() as Record<string, unknown>)?.["activeCompanyId"]) : "") || user.uid;
      if (lastSeenActiveCompanyId !== null && lastSeenActiveCompanyId !== companyId) {
        window.dispatchEvent(new CustomEvent("studioflow-active-company-changed", { detail: { companyId } }));
        window.location.reload();
        return;
      }
      lastSeenActiveCompanyId = companyId;

      if (unsubPersonal) { unsubPersonal(); unsubPersonal = null; }
      const personalRef = doc(db, "companies", companyId, "personalInterfaceSettings", user.uid);
      unsubPersonal = onSnapshot(personalRef, snap2 => {
        const data = snap2.exists() ? (snap2.data() as Record<string, unknown>) : {};
        const rawLang = data?.["selectedLanguage"];
        const rawTheme = data?.["appTheme"];
        setLanguage(typeof rawLang === "string" && rawLang.trim() ? rawLang.trim() : "English");
        setTheme(typeof rawTheme === "string" && rawTheme.trim() ? rawTheme.trim() : "System");
      }, () => { setLanguage("English"); setTheme("System"); });
    });

    return () => {
      unsubUserDoc();
      if (unsubPersonal) unsubPersonal();
    };
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

      // Returning users on this device have already passed the workspace
      // bootstrap — show the app immediately and re-run the check in the
      // background. Only first-time sign-ins block on it (they genuinely need
      // the workspace docs to exist before pages can query).
      const readyKey = `nv_ws_ready_${currentUser.uid}`;
      let alreadyReady = false;
      try {
        alreadyReady = window.localStorage.getItem(readyKey) === "1";
      } catch {
        // localStorage unavailable — fall back to the blocking path.
      }

      if (alreadyReady) {
        setUser(currentUser);
        setLoading(false);
        void ensurePersonalWorkspace(currentUser).catch(error => {
          console.warn("Background workspace check failed.", error);
        });
        return;
      }

      setLoading(true);
      ensurePersonalWorkspace(currentUser)
        .then(() => {
          try {
            window.localStorage.setItem(readyKey, "1");
          } catch {
            // Best-effort flag only.
          }
        })
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

  const value = useMemo(() => ({ user, loading, language, theme }), [user, loading, language, theme]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
