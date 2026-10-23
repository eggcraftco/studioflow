/**
 * GN-10 — lib/auth/secondFactor.ts against the Firebase Auth EMULATOR with the real web SDK.
 *
 *  W1 an account without a factor signs in through withSecondFactor untouched (no prompt).
 *  W2 an account WITH a factor: the SDK raises auth/multi-factor-auth-required, the wrapper
 *     catches it and builds the resolver. The emulator can only enrol SMS factors (no TOTP),
 *     so the wrapper must refuse that factor kind plainly and never open the code prompt.
 *  W3 wrong password is passed through as the normal error (not treated as MFA).
 *  W4 code normalisation, refusal sentences for the server gate reasons.
 *  NOT covered (needs Identity Platform TOTP in a real project): the TOTP prompt loop,
 *  resolveSignIn with a TOTP assertion, wrong/expired TOTP codes, enrolment with a QR secret.
 *
 * Needs the Auth emulator on 127.0.0.1:9399 (project demo-nivadesk-gn10).
 * Run: NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-nivadesk-gn10 \
 *      node --experimental-strip-types --import ./scripts/lib/register-alias.mjs scripts/check-second-factor.mts
 */
import assert from "node:assert/strict";
import { connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import {
  isMultiFactorRequired,
  normalizeTotpCode,
  registerSecondFactorPresenter,
  secondFactorRefusalMessage,
  withSecondFactor
} from "@/lib/auth/secondFactor";

const PROJECT = "demo-nivadesk-gn10";
const H = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9399"}`;
const KEY = "fake-api-key";
connectAuthEmulator(auth, H, { disableWarnings: true });

async function j(method: string, url: string, body?: unknown, asAdmin = false) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json", ...(asAdmin ? { authorization: "Bearer owner" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, d: (await r.json().catch(() => ({}))) as Record<string, any> };
}
const codeFor = async (s: string) => ((await j("GET", `${H}/emulator/v1/projects/${PROJECT}/verificationCodes`)).d.verificationCodes || []).find((c: any) => c.sessionInfo === s)?.code;

async function makeUser(withFactor: boolean) {
  const email = `web-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
  const password = "Gn10-web-pass-1";
  const su = await j("POST", `${H}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { email, password, returnSecureToken: true });
  await j("POST", `${H}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { localId: su.d.localId, emailVerified: true }, true);
  if (withFactor) {
    const si = await j("POST", `${H}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, { email, password, returnSecureToken: true });
    const phone = `+4477009003${String(Math.floor(Math.random() * 90) + 10)}`;
    const st = await j("POST", `${H}/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:start?key=${KEY}`, { idToken: si.d.idToken, phoneEnrollmentInfo: { phoneNumber: phone } });
    const fin = await j("POST", `${H}/identitytoolkit.googleapis.com/v2/accounts/mfaEnrollment:finalize?key=${KEY}`, { idToken: si.d.idToken, phoneVerificationInfo: { sessionInfo: st.d.phoneSessionInfo.sessionInfo, code: await codeFor(st.d.phoneSessionInfo.sessionInfo) } });
    assert.equal(fin.status, 200);
  }
  return { email, password };
}

let prompts = 0;
registerSecondFactorPresenter(async () => { prompts += 1; return { kind: "cancel" }; });
let passed = 0;
const ok = (name: string) => { passed += 1; console.log(`ok - ${name}`); };

// W1
{
  const u = await makeUser(false);
  const cred = await withSecondFactor(auth, () => signInWithEmailAndPassword(auth, u.email, u.password), { email: u.email });
  assert.equal(cred.user.email, u.email);
  assert.equal(prompts, 0);
  await signOut(auth);
  ok("W1 no factor: signs in through the wrapper, no prompt");
}
// W2
{
  const u = await makeUser(true);
  let raw: unknown;
  try { await signInWithEmailAndPassword(auth, u.email, u.password); } catch (e) { raw = e; }
  assert.ok(isMultiFactorRequired(raw), "SDK raised auth/multi-factor-auth-required");
  ok("W2a factor enrolled: the SDK raises multi-factor-auth-required (detected)");
  let wrapped: any;
  try { await withSecondFactor(auth, () => signInWithEmailAndPassword(auth, u.email, u.password), { email: u.email }); } catch (e) { wrapped = e; }
  assert.equal(wrapped?.code, "nivadesk/unsupported-second-factor");
  assert.equal(prompts, 0, "no code prompt for a factor kind the web cannot ask for");
  assert.equal(auth.currentUser, null, "not signed in");
  ok("W2b SMS factor (emulator): wrapper resolves hints, refuses the unsupported kind, stays signed out");
}
// W3
{
  const u = await makeUser(false);
  let e: any;
  try { await withSecondFactor(auth, () => signInWithEmailAndPassword(auth, u.email, "wrong-pass-123")); } catch (x) { e = x; }
  assert.ok(e && !isMultiFactorRequired(e));
  assert.match(String(e.code), /auth\/(wrong-password|invalid-credential)/);
  ok("W3 wrong password passes through unchanged");
}
// W4
{
  assert.equal(normalizeTotpCode("123 456"), "123456");
  assert.equal(normalizeTotpCode(" 123-456 "), "123456");
  assert.equal(normalizeTotpCode("12345"), "");
  assert.equal(normalizeTotpCode("1234567"), "");
  assert.equal(normalizeTotpCode(""), "");
  assert.match(secondFactorRefusalMessage("second_factor_required"), /sign in again/i);
  assert.match(secondFactorRefusalMessage("recent_sign_in_required"), /sign in again/i);
  assert.equal(secondFactorRefusalMessage("other"), "");
  ok("W4 code normalisation + gate refusal sentences");
}
console.log(`# pass ${passed} / 5`);
process.exit(0);
