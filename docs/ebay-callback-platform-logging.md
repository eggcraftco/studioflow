# Where the OAuth code actually ends up — measured, not assumed

6 September 2026. Two hops carry eBay's callback: the browser lands on `nivadesk.app/ebay/callback`
(Hostinger, LiteSpeed), and today that redirects to the Cloud Function with the parameters in the
URL. This note records what each hop keeps, measured with synthetic values.

## The measurement

Three requests were sent to production at 13:39:13 UTC with values that cannot be mistaken for real
ones:

```
/ebay/callback?code=SYNTHCODE-133913&state=SYNTHSTATE-133913
/ebay/callback?code=SYNTHCODE2-133913&state=SYNTHSTATE2-133913&nonce=SYNTHNONCE-133913
/ebay/callback?state=SYNTHONLY-133913
```

**Hostinger keeps the query string, verbatim.** hPanel → Analizler → Erişim günlükleri shows the row:

| Field | Value |
|---|---|
| Saat | 2026-09-06 14:39:13 |
| İstek | `GET /ebay/callback?state=SYNTHONLY-133913 HTTP/2` |
| Cihaz | `curl/8.7.1` |
| IP, Ülke | the caller's address, United Kingdom |

The other two rows are there as well, carrying the synthetic `code` and `nonce`. The view offers a
search box, a filter of up to **7 days**, and a **download** button. There is **no setting anywhere in
the panel to disable access logging or to redact a path**, and the site's "runtime logs" are a
different thing entirely: they carry only the Next.js process output and contain none of the
requests (searched, no match).

For completeness: the site is served by LiteSpeed at Hostinger. DNS is on Cloudflare nameservers, but
the A record resolves to Hostinger and no `cf-ray` header comes back, so **Cloudflare is DNS-only and
proxies nothing today** — it neither sees nor logs these requests.

## What this means, stated exactly

The server-to-server POST change removes the code, state and nonce from the **Google** side: nothing
sensitive will appear in a Cloud Run request URL any more. It does **not** touch the first hop. eBay
delivers `code` and `state` to the accepted URL as query parameters, and Hostinger writes that line
to a log the panel can read and download.

So the claim "OAuth secrets no longer appear in platform logs" is **not true and must not be made**.
The accurate statement after the POST change is: the browser-binding nonce appears in no log at all,
and the authorization code and state appear in Hostinger's access log for the accepted URL.

## What the residual exposure is worth

Whoever reads that log sees a code that is single-use, expires quickly, and is worthless without the
application's client secret, together with a state that is burned on first use and bound by a cookie
the reader does not have. To turn it into a connection an attacker needs the log **and** the client
secret **and** the seller's browser. That is a narrow path, but it is not nothing, and it is exactly
the sort of thing an access review asks about.

## Options, for the operator to choose

**1. Ask Hostinger, in writing.** The panel exposes no switch, so only they can say whether access
logging can be disabled or a path redacted, how long entries are kept beyond the seven days the view
offers, who inside Hostinger can read them, and whether the log feeds their malware or security
tooling. Costs nothing, settles the question. A draft is at the end of this note.

**2. Take the callback off Hostinger.** Point the RuName's accepted URL at `connect.nivadesk.app`, a
proxied Cloudflare hostname running a Worker that receives eBay's GET and posts to the Cloud Function
exactly as the web route will. DNS is already on Cloudflare, and the main site stays DNS-only, so
this adds a hostname rather than moving the site. The seller still sees a nivadesk.app address. What
it costs: a second deployment target and a Worker to maintain, plus the RuName has to be re-registered
with the new accepted URL, on both keysets.

**3. Accept it, with the nonce removed and the reasoning written down.** Do the POST change, leave
the accepted URL where it is, and record the residual above as an accepted risk with a named owner.

**4. Do nothing.** Not recommended: today the nonce is in the log too, which is the one value that
defends against a phished seller's consent landing in the wrong workspace.

The recommendation is **1 now, 3 as the working position, and 2 if Hostinger's answer is that the
query string is retained with no way to redact it and the operator is not content with 3**.

## Draft question for Hostinger support

> Our site nivadesk.app (Cloud Startup, Web App, Node 22) receives an OAuth callback on one path,
> `/ebay/callback`. The provider delivers a single-use authorization code as a query parameter, and
> we can see the full request line, query string included, in hPanel under Analytics → Access logs.
> Three questions. First: can access logging be disabled for this site, or the query string stripped
> or redacted for one path? Second: how long are these entries retained on your side, beyond the
> seven days the panel shows, and who within Hostinger can read them? Third: are they used by any
> other system, for example malware scanning or abuse detection, and if so with what retention? We
> are not asking for the entries to be deleted; we need to document where a short-lived credential is
> stored and for how long.

## Sent — 2026-09-06 14:52 local (13:52 UTC)

The operator approved sending it. Asked through hPanel's support chat, which routes to a human when
the answer needs one ("İsteğiniz yönlendiriliyor" — your request is being routed). The five questions
as sent:

1. Can query-string logging be disabled, or the query string stripped or redacted, for a specific
   path on this site? If not per path, can access logging be disabled for the whole site?
2. What is the real retention period of these entries on Hostinger's side, beyond the seven days the
   panel filter offers?
3. Who can read them — which roles inside Hostinger — and is that access audited?
4. Are they forwarded to any other system: a SIEM, an analytics pipeline, a backup, or malware and
   abuse scanning? With what retention?
5. Is there any masking option for URL query values, at any level: web server, CDN or panel?

The message named the site, the path and the nature of the credential. It contained no secret, no
code and no token. It also said plainly that we are not asking for anything to be deleted, only for
a written answer about where a short-lived credential is stored and who can see it.

First response from Hostinger's assistant confirmed two facts before answering the policy half: the
site is a Node.js application on Cloud Startup, and **Hostinger's CDN is not enabled for
nivadesk.app** — so there is no CDN layer holding a second copy of these request lines. The
substantive answers are recorded below as they arrive.

| Question | Answer | Received |
|---|---|---|
| 1. Path-level disable or redaction | — | — |
| 2. Real retention | — | — |
| 3. Who can read | — | — |
| 4. Forwarded to other systems | — | — |
| 5. Query-value masking | — | — |

**An assistant's answer is not a policy answer.** Anything that decides the production gate must come
from a human agent or Hostinger documentation, and is marked here with which of the two it was.
