package uk.co.eggcraft.studioflow.features.production

import uk.co.eggcraft.studioflow.data.model.StudioOrder
import kotlin.math.ceil

/**
 * The Android half of functions/production.js.
 *
 * Production status is NOT order status, payment status or delivery status. An
 * order can be paid, undelivered and still sitting in Quality Check. The stage
 * a job is in is DERIVED from the production steps already on the order rather
 * than stored beside them, so the board and the order can never disagree — and
 * because it is derived, this file has to reach exactly the same answer the
 * server, the web and the Apple apps reach. The shared regression lives in
 * functions/test/qa/production-stage.test.js.
 */
enum class ProductionStageKind { Ready, Active, Blocked, Review, ShipReady, Done;

    companion object {
        fun from(raw: String?): ProductionStageKind = when (raw) {
            "ready" -> Ready
            "blocked" -> Blocked
            "review" -> Review
            "shipready" -> ShipReady
            "done" -> Done
            else -> Active
        }
    }

    val raw: String
        get() = when (this) {
            Ready -> "ready"
            Active -> "active"
            Blocked -> "blocked"
            Review -> "review"
            ShipReady -> "shipready"
            Done -> "done"
        }
}

data class ProductionStage(
    val id: String,
    val title: String,
    val kind: ProductionStageKind,
    val wipLimit: Int
)

/** Why a job stopped. The Blocked lane exists to say why, so a blocker with no
 *  recognised reason is not a blocker at all. */
data class ProductionBlocker(val reason: String, val note: String) {
    companion object {
        val reasons = listOf(
            "waiting_for_customer_approval",
            "material_unavailable",
            "supplier_delay",
            "technical_problem",
            "other"
        )

        val labels = mapOf(
            "waiting_for_customer_approval" to "Waiting for customer approval",
            "material_unavailable" to "Material unavailable",
            "supplier_delay" to "Supplier delay",
            "technical_problem" to "Technical problem",
            "other" to "Other"
        )

        fun of(order: StudioOrder): ProductionBlocker? {
            if (order.productionBlockerReason !in reasons) return null
            return ProductionBlocker(order.productionBlockerReason, order.productionBlockerNote)
        }
    }

    val label: String get() = labels[reason] ?: "Blocked"
}

val defaultProductionStages = listOf(
    ProductionStage("ready", "Ready", ProductionStageKind.Ready, 10),
    ProductionStage("in_production", "In Production", ProductionStageKind.Active, 10),
    ProductionStage("blocked", "Waiting / Blocked", ProductionStageKind.Blocked, 10),
    ProductionStage("quality_check", "Quality Check", ProductionStageKind.Review, 10),
    ProductionStage("ready_to_ship", "Ready to Ship", ProductionStageKind.ShipReady, 10),
    ProductionStage("done", "Done", ProductionStageKind.Done, 0)
)

private fun slug(value: String): String {
    val mapped = value.lowercase().map { if (it.isLetterOrDigit()) it else '_' }.joinToString("")
    val parts = mapped.split("_").filter { it.isNotEmpty() }
    return if (parts.isEmpty()) "stage" else parts.joinToString("_")
}

/** Exactly one lane may mean "not started", "stuck" and "finished"; the middle
 *  of the board is the workshop's to shape. Never returns an empty board. */
fun productionStagesFrom(raw: Any?): List<ProductionStage> {
    val list = (raw as? List<*>) ?: emptyList<Any?>()
    val stages = mutableListOf<ProductionStage>()
    val seen = mutableSetOf<String>()
    for (entry in list) {
        val map = entry as? Map<*, *> ?: continue
        val title = (map["title"] as? String)?.trim().orEmpty()
        if (title.isEmpty()) continue
        var id = slug((map["id"] as? String).orEmpty().ifEmpty { title })
        while (id in seen) id = "${id}_${stages.size + 1}"
        seen.add(id)
        stages.add(
            ProductionStage(
                id = id,
                title = title,
                kind = ProductionStageKind.from(map["kind"] as? String),
                wipLimit = ((map["wipLimit"] as? Number)?.toInt() ?: 0).coerceAtLeast(0)
            )
        )
    }
    if (stages.isEmpty()) return defaultProductionStages

    for (kind in listOf(ProductionStageKind.Ready, ProductionStageKind.Blocked, ProductionStageKind.Done)) {
        if (stages.any { it.kind == kind }) continue
        val fallback = defaultProductionStages.first { it.kind == kind }
        var id = fallback.id
        if (id in seen) id = "${id}_${stages.size + 1}"
        seen.add(id)
        val repaired = fallback.copy(id = id)
        if (kind == ProductionStageKind.Ready) stages.add(0, repaired) else stages.add(repaired)
    }
    if (stages.none { it.kind == ProductionStageKind.Active }) {
        stages.add(minOf(1, stages.size), defaultProductionStages[1].copy(id = "in_production_1"))
    }
    return stages
}

data class ResolvedProductionStage(
    val stageId: String,
    /** "auto", "manual", "blocker" or "delivered" — why the card is here. */
    val source: String,
    val doneCount: Int,
    val total: Int,
    val blocker: ProductionBlocker?,
    /** The step now being worked — the card's "current operation" line. */
    val currentStep: String
)

private val doneValues = setOf("done", "complete", "completed", "finished", "yes", "ready")
private val idleValues = setOf("", "not yet", "new", "none", "no", "pending", "todo", "to do", "waiting")

fun productionStepIsDone(value: String): Boolean = value.trim().lowercase() in doneValues

private fun productionStepIsIdle(value: String): Boolean = value.trim().lowercase() in idleValues

/** Step 0 answers in designStatus, step 1 in status, the rest in extraStatuses
 *  keyed either by `statusStep::<id>` or by the raw title. Mirrors the client
 *  that wrote them. */
fun productionStepValue(order: StudioOrder, stepId: String, stepTitle: String, index: Int): String {
    val rawId = stepId.ifEmpty { stepTitle }
    order.extraStatuses["statusStep::${rawId.lowercase()}"]?.takeIf { it.isNotBlank() }?.let { return it }
    order.extraStatuses[stepTitle]?.takeIf { it.isNotBlank() }?.let { return it }
    return when (index) {
        0 -> order.designStatus
        1 -> order.status
        else -> ""
    }
}

/** The single rule every platform follows. */
fun resolveProductionStage(
    order: StudioOrder,
    stages: List<ProductionStage>,
    steps: List<Pair<String, String>>
): ResolvedProductionStage {
    val blockedStage = stages.firstOrNull { it.kind == ProductionStageKind.Blocked }
    val readyStage = stages.firstOrNull { it.kind == ProductionStageKind.Ready } ?: stages.firstOrNull()
    val doneStage = stages.firstOrNull { it.kind == ProductionStageKind.Done } ?: stages.lastOrNull()
    val shipReady = stages.firstOrNull { it.kind == ProductionStageKind.ShipReady }
        ?: stages.firstOrNull { it.kind == ProductionStageKind.Review }
        ?: doneStage
    val firstActive = stages.firstOrNull { it.kind == ProductionStageKind.Active } ?: readyStage

    val values = steps.mapIndexed { index, step ->
        productionStepValue(order, step.first, step.second, index)
    }
    val doneCount = values.count { productionStepIsDone(it) }
    val total = steps.size
    val currentIndex = values.indexOfFirst { !productionStepIsDone(it) }
    val currentStep = if (currentIndex >= 0) steps[currentIndex].second else ""

    fun result(stage: ProductionStage?, source: String, blocker: ProductionBlocker? = null) =
        ResolvedProductionStage(stage?.id.orEmpty(), source, doneCount, total, blocker, currentStep)

    // A blocker outranks everything: a stuck job is stuck wherever it stood.
    val blocker = ProductionBlocker.of(order)
    if (blocker != null && blockedStage != null) return result(blockedStage, "blocker", blocker)

    // An override is a person's decision; only delivery overrules it, because
    // nothing already with the customer is still on the bench.
    if (order.isDelivered && doneStage != null) return result(doneStage, "delivered")
    val override = order.productionStageOverride
    if (override.isNotEmpty()) {
        stages.firstOrNull { it.id == override }?.let { return result(it, "manual") }
    }

    if (total == 0) return result(readyStage, "auto")
    if (doneCount >= total) return result(shipReady, "auto")
    if (values.all { productionStepIsIdle(it) }) return result(readyStage, "auto")

    // Name binding: when the step being worked shares its name with a lane,
    // that lane is plainly the right one.
    if (currentStep.isNotEmpty()) {
        val wanted = currentStep.trim().lowercase()
        stages.firstOrNull { it.kind != ProductionStageKind.Blocked && it.title.trim().lowercase() == wanted }
            ?.let { return result(it, "auto") }
    }
    return result(firstActive, "auto")
}

enum class ProductionWipLevel { None, Ok, Near, Over }

/** Green well under the limit, amber approaching it, red over. The bar warns;
 *  it never blocks — a workshop can always take one more job. */
fun productionWipLevel(count: Int, limit: Int): ProductionWipLevel = when {
    limit <= 0 -> ProductionWipLevel.None
    count > limit -> ProductionWipLevel.Over
    count >= ceil(limit * 0.8).toInt() -> ProductionWipLevel.Near
    else -> ProductionWipLevel.Ok
}
