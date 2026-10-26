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

// The release workflow passes -PappVersion=1.2.0 from the v1.2.0 tag; local
// builds use the fallback. versionCode must grow with every release that
// installs over the last one: 1.2.0 -> 10200.
val appVersion = providers.gradleProperty("appVersion").getOrElse("1.0.1")
require(Regex("""\d{1,2}\.\d{1,2}\.\d{1,2}""").matches(appVersion)) {
    "appVersion must look like 1.2.0 (each part below 100), got '$appVersion'"
}
val appVersionCode = appVersion.split(".").map(String::toInt).let { (major, minor, patch) ->
    major * 10000 + minor * 100 + patch
}

android {
    namespace = "com.ringscheduler.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.ringscheduler.app"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersion

        // The API the app talks to. Only debug builds let the login screen change it.
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"https://ring-scheduler.vercel.app\"")
        // Where alarms are managed; opened from the home screen.
        buildConfigField("String", "WEB_URL", "\"https://ring-scheduler-web.vercel.app\"")
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
    implementation("com.google.android.material:material:1.14.0")
}
