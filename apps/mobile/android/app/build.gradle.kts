plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.ahmedapps.ftc"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Replace this before the first Play Console upload with the registered package name.
        applicationId = "com.ahmedapps.ftc"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    val releaseKeyFile = System.getenv("FTC_ANDROID_KEYSTORE")
    val releaseKeyAlias = System.getenv("FTC_ANDROID_KEY_ALIAS")
    val releaseStorePassword = System.getenv("FTC_ANDROID_STORE_PASSWORD")
    val releaseKeyPassword = System.getenv("FTC_ANDROID_KEY_PASSWORD")

    signingConfigs {
        create("release") {
            if (!releaseKeyFile.isNullOrBlank() && !releaseKeyAlias.isNullOrBlank() &&
                !releaseStorePassword.isNullOrBlank() && !releaseKeyPassword.isNullOrBlank()) {
                storeFile = file(releaseKeyFile)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            if (gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) } &&
                (releaseKeyFile.isNullOrBlank() || releaseKeyAlias.isNullOrBlank() ||
                    releaseStorePassword.isNullOrBlank() || releaseKeyPassword.isNullOrBlank())) {
                throw GradleException("Set the FTC_ANDROID_* signing environment variables before building a release.")
            }
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
