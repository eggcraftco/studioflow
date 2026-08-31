package uk.co.eggcraft.studioflow.data.model

/**
 * Every link a customer is given lives on the workspace's OWN host when it has
 * paid for one. The workspace document carries the two fields this is derived
 * from (clientPortalCustomHost / clientPortalSlug); the derived host travels on
 * StudioWorkspace.clientPortalHost, and nothing else builds these strings.
 *
 * This mirrors the web, function for function:
 *   host derivation  -> studioflow-web/lib/studioflow/firestore.ts (clientPortalHost)
 *   portalUrlForToken-> studioflow-web/lib/studioflow/customerPortal.ts
 *   originFor        -> studioflow-web/lib/studioflow/fileMask.ts
 * A blank host falls back to ours, so a workspace without a branded domain keeps
 * the links it has always had.
 */
object CustomerLinks {
    const val DEFAULT_HOST = "nivadesk.app"
    const val DEFAULT_ORIGIN = "https://$DEFAULT_HOST"

    /** The workspace's customer host: their own domain, else their subdomain, else nothing. */
    fun workspaceHost(customHost: String?, slug: String?): String {
        val custom = customHost.orEmpty().trim().lowercase()
        if (custom.isNotEmpty()) return custom
        val name = slug.orEmpty().trim().lowercase()
        return if (name.isNotEmpty()) "$name.$DEFAULT_HOST" else ""
    }

    /** The customer's order-tracking link. No token, no link. */
    fun portalUrlForToken(token: String, brandedHost: String = ""): String {
        if (token.isBlank()) return ""
        val host = brandedHost.trim().lowercase().ifEmpty { DEFAULT_HOST }
        return "https://$host/track/$token"
    }

    /** Origin for the other customer-facing links (shared files). */
    fun originFor(brandedHost: String = ""): String {
        val lowered = brandedHost.trim().lowercase()
        val host = when {
            lowered.startsWith("https://") -> lowered.removePrefix("https://")
            lowered.startsWith("http://") -> lowered.removePrefix("http://")
            else -> lowered
        }.substringBefore("/")
        return if (host.isNotEmpty()) "https://$host" else DEFAULT_ORIGIN
    }
}
