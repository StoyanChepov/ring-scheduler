import java.util.Properties

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

// Release signing comes from apps/android/keystore.properties (git-ignored):
//   storeFile=keystore/ring-scheduler-release.jks
//   storePassword=...
//   keyAlias=ring-scheduler
//   keyPassword=...
// Without it, release builds are produced unsigned.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "com.ringscheduler.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.ringscheduler.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.0"

        // What the login screen suggests; the user can still change it.
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"https://ring-scheduler.vercel.app\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (keystoreProperties.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // With `adb reverse tcp:3000 tcp:3000`, localhost on the phone is the PC.
            buildConfigField("String", "DEFAULT_SERVER_URL", "\"http://localhost:3000\"")
        }
        release {
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

base {
    // ring-scheduler-release.apk instead of app-release.apk
    archivesName.set("ring-scheduler")
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:35.0.2"))
    implementation("com.google.firebase:firebase-messaging")
}
