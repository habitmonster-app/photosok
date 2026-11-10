plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 웹앱(../../dist)을 그대로 앱 안에 넣는다. 인터넷 없이 앱 안에서만 열린다.
val webDist = rootProject.projectDir.resolve("../dist")
val copyWeb by tasks.registering(Sync::class) {
    from(webDist) {
        exclude("sw.js", "manifest.webmanifest", ".nojekyll")
    }
    into(layout.buildDirectory.dir("generated/web/www"))
}

// 애드몹 ID: android/gradle.properties 의 admobAppId·admobBannerId·admobNativeId·admobRewardedId.
// 실제 ID는 스토어용(release) 빌드에만 쓴다. 테스트(debug) 빌드와 아직 없는 ID는 구글 테스트 광고.
fun prop(name: String, fallback: String) = (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: fallback
val TEST_APP = "ca-app-pub-3940256099942544~3347511713"
val TEST_BANNER = "ca-app-pub-3940256099942544/9214589741"
val TEST_NATIVE = "ca-app-pub-3940256099942544/2247696110"
val TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917"

// 출시용 서명 키: CI 비밀값(UPLOAD_KEYSTORE_B64 등)에서. 없으면 release 빌드를 만들지 않는다.
val uploadStore = System.getenv("UPLOAD_KEYSTORE_PATH")

android {
    namespace = "com.habitmonster.photosok"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.habitmonster.photosok"
        minSdk = 29
        targetSdk = 35
        // CI 빌드 번호를 버전으로: 덮어 설치 가능
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.28." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        // 테스트용 고정 키: 새 빌드를 지우지 않고 덮어 설치할 수 있게. 스토어 출시용 키는 따로 만든다.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (uploadStore != null) create("upload") {
            storeFile = file(uploadStore)
            storePassword = System.getenv("UPLOAD_STORE_PASSWORD")
            keyAlias = System.getenv("UPLOAD_KEY_ALIAS")
            keyPassword = System.getenv("UPLOAD_KEY_PASSWORD")
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
            manifestPlaceholders["admobAppId"] = TEST_APP
            buildConfigField("String", "ADMOB_BANNER", "\"$TEST_BANNER\"")
            buildConfigField("String", "ADMOB_NATIVE", "\"$TEST_NATIVE\"")
            buildConfigField("String", "ADMOB_REWARDED", "\"$TEST_REWARDED\"")
        }
        getByName("release") {
            if (uploadStore != null) signingConfig = signingConfigs.getByName("upload")
            // 웹 화면과 이어진 코드(JavascriptInterface)가 지워지지 않게 코드 줄이기는 끈다.
            isMinifyEnabled = false
            manifestPlaceholders["admobAppId"] = prop("admobAppId", TEST_APP)
            buildConfigField("String", "ADMOB_BANNER", "\"${prop("admobBannerId", TEST_BANNER)}\"")
            buildConfigField("String", "ADMOB_NATIVE", "\"${prop("admobNativeId", TEST_NATIVE)}\"")
            buildConfigField("String", "ADMOB_REWARDED", "\"${prop("admobRewardedId", TEST_REWARDED)}\"")
        }
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web"))

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

tasks.named("preBuild") { dependsOn(copyWeb) }

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("com.google.android.gms:play-services-ads:23.6.0")
    implementation("com.google.android.ump:user-messaging-platform:3.1.0")
}
