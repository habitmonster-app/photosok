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

// 애드몹 ID: android/gradle.properties 의 admobAppId·admobBannerId·admobNativeId·admobRewardedId. 없으면 구글 테스트 광고.
fun prop(name: String, fallback: String) = (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: fallback
val admobAppId = prop("admobAppId", "ca-app-pub-3940256099942544~3347511713")
val admobBannerId = prop("admobBannerId", "ca-app-pub-3940256099942544/9214589741")
val admobNativeId = prop("admobNativeId", "ca-app-pub-3940256099942544/2247696110")
val admobRewardedId = prop("admobRewardedId", "ca-app-pub-3940256099942544/5224354917")

android {
    namespace = "com.habitmonster.photosok"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.habitmonster.photosok"
        minSdk = 29
        targetSdk = 34
        // CI 빌드 번호를 버전으로: 덮어 설치 가능
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.22." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
        manifestPlaceholders["admobAppId"] = admobAppId
        buildConfigField("String", "ADMOB_BANNER", "\"$admobBannerId\"")
        buildConfigField("String", "ADMOB_NATIVE", "\"$admobNativeId\"")
        buildConfigField("String", "ADMOB_REWARDED", "\"$admobRewardedId\"")
    }

    signingConfigs {
        // 테스트용 고정 키: 새 빌드를 지우지 않고 덮어 설치할 수 있게. 스토어 출시용 키는 따로 만든다.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("debug") }
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
