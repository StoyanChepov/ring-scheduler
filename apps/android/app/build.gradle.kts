plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.ringscheduler.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.ringscheduler.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:35.0.2"))
    implementation("com.google.firebase:firebase-messaging")
}
