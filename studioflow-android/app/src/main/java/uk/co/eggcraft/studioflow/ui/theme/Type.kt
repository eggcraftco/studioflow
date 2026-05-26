package uk.co.eggcraft.studioflow.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Typography aligned with the iOS app (EGGcraft / StudioFlow Apple).
 * iOS reference scale:
 *   28sp  → page H1 (titleLarge)
 *   22sp  → page H2 (headlineMedium)
 *   20sp  → section header (headlineSmall)
 *   18sp  → subsection / strong label (titleMedium)
 *   17sp  → primary body / button label (bodyLarge)
 *   14sp  → body (bodyMedium)
 *   13sp  → secondary body / form helper (bodySmall)
 *   12sp  → caption / metadata / pill label (labelMedium)
 *   11sp  → timestamp / micro label (labelSmall)
 */
val StudioTypography = Typography().run {
    val sans = FontFamily.SansSerif
    copy(
        // — Display & headlines
        displaySmall = displaySmall.copy(fontFamily = sans, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp, letterSpacing = 0.sp),
        headlineLarge = headlineLarge.copy(fontFamily = sans, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, letterSpacing = 0.sp),
        headlineMedium = headlineMedium.copy(fontFamily = sans, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, letterSpacing = 0.sp),
        headlineSmall = headlineSmall.copy(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 20.sp, letterSpacing = 0.sp),

        // — Titles
        titleLarge = titleLarge.copy(fontFamily = sans, fontWeight = FontWeight.ExtraBold, fontSize = 28.sp, letterSpacing = 0.sp),
        titleMedium = titleMedium.copy(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 18.sp, letterSpacing = 0.sp),
        titleSmall = titleSmall.copy(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, letterSpacing = 0.sp),

        // — Body
        bodyLarge = bodyLarge.copy(fontFamily = sans, fontSize = 17.sp, letterSpacing = 0.sp),
        bodyMedium = bodyMedium.copy(fontFamily = sans, fontSize = 14.sp, letterSpacing = 0.sp),
        bodySmall = bodySmall.copy(fontFamily = sans, fontSize = 13.sp, letterSpacing = 0.sp),

        // — Labels
        labelLarge = labelLarge.copy(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 14.sp, letterSpacing = 0.sp),
        labelMedium = labelMedium.copy(fontFamily = sans, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 0.sp),
        labelSmall = labelSmall.copy(fontFamily = sans, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 0.sp)
    )
}
