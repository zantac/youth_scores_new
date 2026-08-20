import java.util.Properties
import java.io.FileInputStream

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Firebase (reads android/app/google-services.json).
    id("com.google.gms.google-services")
}

android {
    namespace = "com.waellotfy.youthscores"
    // compileSdk 37: some plugins (flutter_secure_storage) require it. This only
    // affects what we compile against (backward compatible); Play enforces the
    // TARGET sdk, pinned to 36 below.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications (uses newer java.time APIs).
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "com.waellotfy.youthscores"
        // Firebase needs a modern minimum; 23 (Android 6) is a safe floor.
        minSdk = flutter.minSdkVersion
        // Android 16 — required by Google Play for new/updated app submissions.
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }
  
   signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = keystoreProperties["storeFile"]?.let { file(it as String) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            // Shrink + obfuscate Java/Kotlin (plugins) and strip unused resources
            // for a smaller, harder-to-reverse release. Dart is obfuscated
            // separately via `flutter build --obfuscate --split-debug-info`.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
