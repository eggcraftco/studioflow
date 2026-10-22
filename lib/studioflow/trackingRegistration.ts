// 17TRACK registration settings (GN-13, owner decisions 22 Oct 2026): the client half of
// getTrackingRegistrationSettings / saveTrackingRegistrationSettings (functions/index.js,
// rules in functions/orders/trackingRegistrations.js).
//
// - Automatic registration is OFF unless the workspace OWNER turns it on. The setting lives in a
//   server-only document; only the owner-only callable writes it.
// - Every new number registered with 17TRACK uses one registration from a limited allowance:
//   at most `caps.daily` per UTC day and `caps.monthly` per UTC month for the workspace (pilot
//   ceiling 10 / 100), enforced on the server. Reading a number that is already registered is free.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

import { trackingRegistrationSettingsFrom, type TrackingRegistrationSettings } from "./trackingRegistrationRules";
export { usageLine, trackingRegistrationSettingsFrom, type TrackingRegistrationSettings } from "./trackingRegistrationRules";

export async function getTrackingRegistrationSettings(workspace: WorkspaceContext): Promise<TrackingRegistrationSettings> {
  const callable = httpsCallable<Record<string, unknown>, unknown>(functions, "getTrackingRegistrationSettings");
  const response = await callable({ companyId: workspace.id });
  return trackingRegistrationSettingsFrom(response.data);
}

export async function saveTrackingRegistrationSettings(workspace: WorkspaceContext, autoRegister: boolean): Promise<TrackingRegistrationSettings> {
  const callable = httpsCallable<Record<string, unknown>, unknown>(functions, "saveTrackingRegistrationSettings");
  const response = await callable({ companyId: workspace.id, autoRegister });
  return trackingRegistrationSettingsFrom(response.data);
}
