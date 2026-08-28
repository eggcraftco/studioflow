import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

// Release signing is read from a gitignored keystore.properties at the project
// root (studioflow-android/keystore.properties). If it is absent, the release
// build type is still produced (unsigned) so debug/CI builds keep working.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) {
        FileInputStream(keystorePropsFile).use { load(it) }
    }
}

android {
    namespace = "uk.co.eggcraft.studioflow"
    compileSdk = 36

    defaultConfig {
        applicationId = "uk.co.eggcraft.studioflow"
        minSdk = 26
        targetSdk = 36
        versionCode = 9
        versionName = "0.1.8"
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        compose = true
        // So Settings ▸ About can read the version from the build rather than a
        // hardcoded string, which had drifted to 1.0.0 while the app shipped 0.1.8.
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.04.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation(platform("com.google.firebase:firebase-bom:34.7.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-functions")
    implementation("com.google.firebase:firebase-storage")
    implementation("com.google.firebase:firebase-messaging")
    implementation("com.google.firebase:firebase-appcheck-playintegrity")
    implementation("com.google.firebase:firebase-analytics")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.biometric:biometric:1.2.0-alpha05")
    implementation("com.android.billingclient:billing-ktx:8.1.0")
    implementation("androidx.fragment:fragment:1.8.5")

    implementation("androidx.activity:activity-compose:1.12.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.credentials:credentials:1.2.0-rc01")
    implementation("androidx.credentials:credentials-play-services-auth:1.2.0-rc01")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
