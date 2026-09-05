#!/usr/bin/env bash
# The one thing Security Command Center could not do for itself on this
# project: grant its own service agents their roles. The organisation enforces
# iam.allowedPolicyMemberDomains (domain-restricted sharing), Google's service
# agents are outside the domain, and the console's grant failed with "One or
# more users named in the policy do not belong to a permitted customer"
# (2026-09-05). Google's documented remedy is: lift the constraint, make the
# grant, put the constraint back. This script does exactly that on THIS
# project only, in one run, and proves the constraint is back before it exits.
#
# What it grants (read from the console's refused request, re-derived live):
#   roles/securitycenter.serviceAgent            → service-project-<n>@security-center-api  (findings, Security Health Analytics)
#   roles/containerthreatdetection.serviceAgent  → …@gcp-sa-ktd-hpsa
#   roles/cloudsecuritycompliance.serviceAgent   → …@gcp-sa-csc-hpsa
#   roles/dspm.serviceAgent                      → …@gcp-sa-dspm-hpsa
# plus anything else a refused SetIamPolicy in the last 24 h asked for that
# is a Google-managed service agent. Nothing human, nothing outside Google.
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
export CLOUDSDK_CORE_PROJECT="$PROJECT"
REGION="europe-west2"
CONSTRAINT="iam.allowedPolicyMemberDomains"
restore() {
  gcloud org-policies delete "$CONSTRAINT" --project="$PROJECT" --quiet >/dev/null 2>&1 || true
  eff=$(gcloud org-policies describe "$CONSTRAINT" --project="$PROJECT" --effective --format='value(spec.rules[0].values.allowedValues)' 2>/dev/null || true)
  if [ -n "$eff" ]; then echo "  ✓ domain restriction back in force on $PROJECT (allowed: $eff)"; else echo "  ❌ domain restriction NOT restored — fix by hand: gcloud org-policies delete $CONSTRAINT --project=$PROJECT"; exit 1; fi
}

echo "══ 0. what is missing (from refused SetIamPolicy requests, minus what is already bound) ══"
WANT=$(gcloud logging read "logName=\"projects/$PROJECT/logs/cloudaudit.googleapis.com%2Factivity\" AND protoPayload.methodName=\"SetIamPolicy\" AND protoPayload.status.code>0" \
  --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=24h --limit=20 --format=json | python3 -c "
import json,sys,subprocess
entries=json.load(sys.stdin)
cur=json.loads(subprocess.run(['gcloud','projects','get-iam-policy','$PROJECT','--format=json'],capture_output=True,text=True).stdout)
have={(b['role'],m) for b in cur['bindings'] for m in b['members']}
want=set()
for e in entries:
    for b in e.get('protoPayload',{}).get('request',{}).get('policy',{}).get('bindings',[]):
        for m in b.get('members',[]):
            if m.startswith('serviceAccount:') and m.endswith('.iam.gserviceaccount.com') and ('gcp-sa-' in m or 'security-center-api' in m) and (b['role'],m) not in have: want.add((b['role'],m))
for r,m in sorted(want): print(r+' '+m)")
[ -n "$WANT" ] || { echo "  nothing missing"; exit 0; }
echo "$WANT" | sed 's/^/  /'

echo "══ 1. lift the constraint on $PROJECT (project-level override, seconds) ══"
POL=$(mktemp); printf 'name: projects/%s/policies/%s\nspec:\n  rules:\n  - allowAll: true\n' "$PROJECT" "$CONSTRAINT" > "$POL"
trap restore EXIT
gcloud org-policies set-policy "$POL" >/dev/null; rm -f "$POL"
sleep 20   # policy propagation

echo "══ 2. grant the service agents their roles ══"
echo "$WANT" | while read -r role member; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="$member" --role="$role" --condition=None --quiet >/dev/null && echo "  + $role → ${member#serviceAccount:}"
done
echo "══ 3. Security Health Analytics (its precondition was the missing agent role) ══"
gcloud scc manage services update security-health-analytics --project="$PROJECT" --enablement-state=enabled --format='value(name.basename(),effectiveEnablementState)' 2>&1 | tail -1 | sed 's/^/  /'

echo "══ 4. put the constraint back (also runs on any failure) ══"
trap - EXIT; restore

echo "══ 5. read back ══"
gcloud projects get-iam-policy "$PROJECT" --format=json | python3 -c "
import json,sys; p=json.load(sys.stdin)
for b in p['bindings']:
    for m in b['members']:
        if 'security-center-api' in m or 'hpsa' in m: print('  ', b['role'], '->', m)"
gcloud scc manage services list --project="$PROJECT" --format='table[no-heading](name.basename(),effectiveEnablementState)' | grep "SECURITY_HEALTH\|EVENT_THREAT\|CLOUD_RUN" | sed 's/^/  /'
echo "══ done ══"
