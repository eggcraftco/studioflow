#!/bin/zsh
# Chain: Cert ID from clipboard -> six versions -> marker + env -> pre-checks -> deploy worker alone -> read-backs -> rows 4/6/8 -> queue logging.
set -u
SP=/private/tmp/claude-501/-Users-gocmen-Developer-studioflow-app/d8da66a6-bfcd-49fb-8094-94f4223b908a/scratchpad
PROJECT=eggcraft-studio; REGION=europe-west2; SA=ebay-connector@$PROJECT.iam.gserviceaccount.com; COMPUTE=477037475099-compute@developer.gserviceaccount.com
cd /Users/gocmen/Developer/studioflow-app || exit 1
stamp() { date -u +%FT%TZ; }
echo "=== $(stamp) EBAY_CLIENT_SECRET from clipboard"
"$SP/ebay/secret-from-clipboard.sh" EBAY_CLIENT_SECRET || { echo "STOP: Cert ID not written"; exit 1; }
echo "=== $(stamp) six versions"
ok=0
for S in EBAY_CLIENT_ID EBAY_CLIENT_SECRET EBAY_TOKEN_KEY EBAY_HASH_KEY EBAY_CALLBACK_KEY NIVADESK_EBAY_DELETION_VERIFICATION_TOKEN; do
  st=$(gcloud secrets versions list "$S" --project=$PROJECT --filter='state=enabled' --format='value(name,createTime)' | head -1)
  echo "  $S: enabled version ${st:-NONE}"; [ -n "$st" ] && ok=$((ok+1))
done
[ "$ok" = 6 ] || { echo "STOP: only $ok/6 enabled — marker NOT created"; exit 1; }
echo "=== $(stamp) marker + env (values below are not secrets)"
touch functions/.ebay-secrets-ready; ls -la functions/.ebay-secrets-ready | awk '{print "  marker:",$NF,$6,$7,$8}'
[ -n "$(tail -c1 functions/.env)" ] && echo >> functions/.env
grep -q '^NIVADESK_EBAY_ENVIRONMENT=' functions/.env || printf 'NIVADESK_EBAY_ENVIRONMENT=sandbox\n' >> functions/.env
grep -q '^NIVADESK_EBAY_RUNAME=' functions/.env || printf 'NIVADESK_EBAY_RUNAME=EGGCRAFT_LIMITE-EGGCRAFT-NivaDe-nerasfwi\n' >> functions/.env
echo "  NIVADESK_EBAY_CONNECTOR lines in .env: $(grep -c '^NIVADESK_EBAY_CONNECTOR=' functions/.env)"; grep '^NIVADESK_EBAY' functions/.env | sed 's/^/  /'
echo "=== $(stamp) pre-checks"
git merge-base --is-ancestor 76c5e3c3 HEAD && echo "  ancestor 76c5e3c3: ok" || { echo "STOP: no Stripe fix"; exit 1; }
[ -z "$(git status --porcelain | grep -v '^??')" ] && echo "  tree clean: ok" || { echo "STOP: dirty tree"; exit 1; }
[ -f functions/.env ] && echo "  functions/.env: present" || exit 1
[ "$(git rev-parse HEAD:functions)" = "$(git rev-parse origin/macbook-save-before-macstudio-2026-06-01:functions)" ] && echo "  functions/ == origin deploy tip: ok" || { echo "STOP: functions differs from origin"; exit 1; }
echo "  HEAD: $(git rev-parse --short HEAD)"
echo "=== $(stamp) deploy ebayEventWorker alone (firebase $(npx firebase --version 2>/dev/null))"
npx firebase deploy --project $PROJECT --only functions:ebayEventWorker --non-interactive 2>&1 | grep -v '^$'
echo "deploy exit ${pipestatus[1]} at $(stamp)"
echo "=== $(stamp) read-back: service"
gcloud run services describe ebayeventworker --region=$REGION --project=$PROJECT --format='value(status.traffic[0].revisionName,status.traffic[0].percent,status.conditions[0].status,spec.template.spec.serviceAccountName,status.url)' || { echo "STOP: service missing"; exit 1; }
gcloud run services describe ebayeventworker --region=$REGION --project=$PROJECT --format=json | python3 -c "
import json,sys;d=json.load(sys.stdin);c=d['spec']['template']['spec']['containers'][0]
print('  image:',c.get('image','')[:120]); print('  timeout:',d['spec']['template']['spec'].get('timeoutSeconds'),'ingress:',d['metadata'].get('annotations',{}).get('run.googleapis.com/ingress'))
for e in c.get('env',[]):
    if 'valueFrom' in e: r=e['valueFrom'].get('secretKeyRef',{}); print('  env',e['name'],'<- secret',r.get('name'),'version',r.get('key'))
    else: print('  env',e['name'],'= (plain value, not shown)')"
echo "=== $(stamp) read-back: queue"
gcloud tasks queues describe ebayEventWorker --location=$REGION --project=$PROJECT --format='value(name,state,retryConfig.maxAttempts,rateLimits.maxConcurrentDispatches,rateLimits.maxDispatchesPerSecond,stackdriverLoggingConfig.samplingRatio)' || { echo "STOP: queue missing"; exit 1; }
echo "=== $(stamp) rows 4, 6, 8"
gcloud tasks queues add-iam-policy-binding ebayEventWorker --location=$REGION --project=$PROJECT --member="serviceAccount:$SA" --role=roles/cloudtasks.enqueuer --quiet --format='value(etag)' >/dev/null 2>&1 && echo "  row 4 enqueuer on queue: bound" || echo "  row 4 FAILED"
gcloud run services add-iam-policy-binding ebayeventworker --region=$REGION --project=$PROJECT --member="serviceAccount:$SA" --role=roles/run.invoker --quiet --format='value(etag)' >/dev/null 2>&1 && echo "  row 6 run.invoker ebay-connector@: bound" || echo "  row 6 FAILED"
gcloud run services add-iam-policy-binding ebayeventworker --region=$REGION --project=$PROJECT --member="serviceAccount:$COMPUTE" --role=roles/run.invoker --quiet --format='value(etag)' >/dev/null 2>&1 && echo "  row 8 run.invoker compute default: bound" || echo "  row 8 FAILED"
echo "=== $(stamp) queue logging 1.0 (D10)"
gcloud tasks queues update ebayEventWorker --location=$REGION --project=$PROJECT --log-sampling-ratio=1.0 --format='value(name,stackdriverLoggingConfig.samplingRatio)'
echo "=== $(stamp) policies after"
echo "  service policy:"; gcloud run services get-iam-policy ebayeventworker --region=$REGION --project=$PROJECT --format=json | python3 -c "import json,sys;p=json.load(sys.stdin);[print('   ',b['role'],'|',m) for b in p.get('bindings',[]) for m in b['members']] or print('    (empty)')"
echo "  queue policy:"; gcloud tasks queues get-iam-policy ebayEventWorker --location=$REGION --project=$PROJECT --format=json | python3 -c "import json,sys;p=json.load(sys.stdin);[print('   ',b['role'],'|',m) for b in p.get('bindings',[]) for m in b['members']] or print('    (empty)')"
gcloud tasks queues describe ebayEventWorker --location=$REGION --project=$PROJECT --format='value(state,retryConfig.maxAttempts,rateLimits.maxConcurrentDispatches,stackdriverLoggingConfig.samplingRatio)' | sed 's/^/  queue state,maxAttempts,maxConcurrent,sampling: /'
echo "=== $(stamp) chain done"
