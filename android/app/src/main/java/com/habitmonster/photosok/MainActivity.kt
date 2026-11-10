package com.habitmonster.photosok

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.util.Size
import androidx.exifinterface.media.ExifInterface
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdOptions
import com.google.android.gms.ads.nativead.NativeAdView
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import android.app.Activity
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * 사진쏙 안드로이드 앱.
 * 웹앱(dist/)을 앱 안에 넣어 인터넷 없이 연다. 파일은 기기 밖으로 보내지 않는다(인터넷 권한 없음).
 * 웹이 못 하는 일(갤러리 저장, 다른 앱으로 공유, 공유받기, 카메라)은 여기서 처리한다.
 */
class MainActivity : Activity() {

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val START = "https://$HOST/www/index.html"
        const val PICK = 41
        const val CAMERA = 42
        const val MAX_SHARED = 20
        const val TRASH = 43
        const val PERM = 44
    }

    private lateinit var web: WebView
    private lateinit var adBox: FrameLayout
    private var adView: AdView? = null
    private var nativeAd: NativeAd? = null
    private var rewarded: RewardedAd? = null
    private var adsStarted = false
    private var adBreaks = 0
    private var lastSheetAt = 0L
    private var bannerWanted = true
    private var dark = true
    private val prefs by lazy { getSharedPreferences("photosok", MODE_PRIVATE) }
    private val consent: ConsentInformation by lazy { UserMessagingPlatform.getConsentInformation(this) }
    private var chooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null
    private val io = Executors.newSingleThreadExecutor()
    private val outFiles = HashMap<String, File>()
    private val pendingShared = ArrayList<JSONObject>()

    private val sharedDir by lazy { File(cacheDir, "shared").apply { mkdirs() } }
    private val outDir by lazy { File(cacheDir, "out").apply { mkdirs() } }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        outDir.listFiles()?.forEach { it.deleteRecursively() }

        val loader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/www/", AppAssets())
            .addPathHandler("/shared/", WebViewAssetLoader.InternalStoragePathHandler(this, sharedDir))
            .addPathHandler("/media/", MediaFiles())
            .build()

        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
            textZoom = 100
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == HOST) return false
                if (url.scheme == "http" || url.scheme == "https") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                chooserCallback?.onReceiveValue(null)
                chooserCallback = callback
                return if (params.isCaptureEnabled) openCamera() else openPicker(params)
            }
        }
        web.addJavascriptInterface(Bridge(), "PhotoSokNative")
        web.setBackgroundColor(0xFF101213.toInt())
        // 웹 화면 아래에 광고 자리를 따로 둔다(웹 화면을 덮지 않음).
        adBox = FrameLayout(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(adBox, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(root)
        web.loadUrl(START)
        setupAds()
        handleIncoming(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncoming(intent)
    }

    @Deprecated("Activity back handling")
    override fun onBackPressed() {
        // 열린 창(꾸미기·자르기·비교 등)이 있으면 그 창부터 닫고, 없을 때만 앱을 닫는다.
        web.evaluateJavascript("(window.PhotoSokBack ? window.PhotoSokBack() : false)") { handled ->
            if (handled == "true") return@evaluateJavascript
            if (web.canGoBack()) web.goBack() else finish()
        }
    }

    override fun onDestroy() {
        adView?.destroy()
        nativeAd?.destroy()
        web.destroy()
        super.onDestroy()
    }

    /** 상태바·내비게이션바 색을 화면 모드에 맞춘다. */
    @Suppress("DEPRECATION")
    private fun applyBars(dark: Boolean) {
        this.dark = dark
        val color = if (dark) 0xFF101213.toInt() else 0xFFF3F4F2.toInt()
        window.statusBarColor = color
        window.navigationBarColor = color
        web.setBackgroundColor(color)
        if (::adBox.isInitialized) adBox.setBackgroundColor(color)
        var flags = window.decorView.systemUiVisibility
        flags = if (dark) flags and android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv() and android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
                else flags or android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        window.decorView.systemUiVisibility = flags
    }

    // ---- 앱 안의 웹 파일 ----
    /** assets/www 를 제공한다. 모듈 스크립트·wasm 이 동작하도록 형식(MIME)을 정확히 붙인다. */
    private inner class AppAssets : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val clean = path.substringBefore('?').ifEmpty { "index.html" }
            if (clean.contains("..")) return null
            return try {
                val stream = assets.open("www/$clean")
                WebResourceResponse(mimeOf(clean), null, stream)
            } catch (e: Exception) {
                WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null)
            }
        }
    }

    private fun mimeOf(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "wasm" -> "application/wasm"
        "pdf" -> "application/pdf"
        "zip" -> "application/zip"
        "md", "txt" -> "text/plain"
        else -> "application/octet-stream"
    }

    // ---- 파일 고르기 / 카메라 ----
    private fun openPicker(params: WebChromeClient.FileChooserParams): Boolean {
        val types = params.acceptTypes.flatMap { it.split(',') }.map { it.trim() }.filter { it.contains('/') }.distinct()
        val multiple = params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
        // 사진만 고를 때는 안드로이드 사진 선택 화면(갤러리처럼 앨범·최근 사진)을 쓴다. 권한 요청 없음.
        if (types.isNotEmpty() && types.all { it.startsWith("image/") } && photoPickerAvailable()) {
            val pick = Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                type = "image/*"
                if (multiple) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, minOf(20, MediaStore.getPickImagesMaxLimit()))
            }
            try { startActivityForResult(pick, PICK); return true } catch (e: Exception) { /* 아래 파일 선택으로 */ }
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (types.size == 1) types[0] else "*/*"
            if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
        }
        return try { startActivityForResult(intent, PICK); true } catch (e: Exception) { cancelChooser(); false }
    }

    private fun photoPickerAvailable(): Boolean = when {
        Build.VERSION.SDK_INT >= 33 -> true
        Build.VERSION.SDK_INT >= 30 -> android.os.ext.SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2
        else -> false
    }

    private fun openCamera(): Boolean {
        val dir = File(cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "사진쏙_촬영_${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        cameraUri = uri
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = ClipData.newRawUri("photo", uri)
        }
        return try { startActivityForResult(intent, CAMERA); true } catch (e: Exception) { cancelChooser(); false }
    }

    private fun cancelChooser() { chooserCallback?.onReceiveValue(null); chooserCallback = null }

    @Deprecated("Activity result")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == TRASH) {
            val ok = if (resultCode == RESULT_OK) "true" else "false"
            web.evaluateJavascript("window.PhotoSokCleanup && PhotoSokCleanup.onTrash($ok)", null)
            return
        }
        val callback = chooserCallback ?: return
        chooserCallback = null
        if (resultCode != RESULT_OK) { callback.onReceiveValue(null); return }
        when (requestCode) {
            CAMERA -> callback.onReceiveValue(cameraUri?.let { arrayOf(it) })
            PICK -> {
                val uris = ArrayList<Uri>()
                data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
                if (uris.isEmpty()) data?.data?.let { uris.add(it) }
                callback.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
            }
            else -> callback.onReceiveValue(null)
        }
    }

    // ---- 공유받기 (다른 앱 → 사진쏙) ----
    private fun handleIncoming(intent: Intent?) {
        intent ?: return
        val uris = ArrayList<Uri>()
        when (intent.action) {
            Intent.ACTION_SEND -> intentStream(intent)?.let { uris.add(it) }
            Intent.ACTION_SEND_MULTIPLE -> intentStreams(intent).let { uris.addAll(it) }
            Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
            else -> return
        }
        if (uris.isEmpty()) return
        intent.action = Intent.ACTION_MAIN
        io.execute {
            val received = ArrayList<JSONObject>()
            sharedDir.listFiles()?.forEach { it.delete() }
            uris.take(MAX_SHARED).forEachIndexed { index, uri ->
                runCatching {
                    val name = displayName(uri) ?: "shared_${index + 1}"
                    val type = contentResolver.getType(uri) ?: ""
                    val stored = "${index}_" + name.replace(Regex("[^\\p{L}\\p{N}._-]"), "_")
                    contentResolver.openInputStream(uri)!!.use { input ->
                        FileOutputStream(File(sharedDir, stored)).use { input.copyTo(it) }
                    }
                    received.add(JSONObject().put("url", "https://$HOST/shared/" + Uri.encode(stored)).put("name", name).put("type", type))
                }
            }
            synchronized(pendingShared) {
                pendingShared.clear(); pendingShared.addAll(received)
            }
            val over = if (uris.size > MAX_SHARED) "true" else "false"
            runOnUiThread { web.evaluateJavascript("window.PhotoSokApp && PhotoSokApp.receiveShared($over)", null) }
        }
    }

    @Suppress("DEPRECATION")
    private fun intentStream(intent: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun intentStreams(intent: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) ?: emptyList()

    private fun displayName(uri: Uri): String? = runCatching {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment

    // ---- 저장 / 공유 보내기 ----
    private fun safeName(name: String): String =
        name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().ifEmpty { "사진쏙_파일" }.take(120)

    /** 이미지 → 갤러리 '사진쏙' 앨범, PDF·ZIP → 다운로드/사진쏙 폴더 */
    private fun saveToDevice(file: File, mime: String): JSONObject {
        val isImage = mime.startsWith("image/")
        val folder = if (isImage) Environment.DIRECTORY_PICTURES + "/사진쏙" else Environment.DIRECTORY_DOWNLOADS + "/사진쏙"
        val collection = if (isImage) MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                         else MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, folder)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = contentResolver.insert(collection, values) ?: throw IllegalStateException("저장 위치를 만들지 못했어요")
        try {
            contentResolver.openOutputStream(uri)!!.use { out -> FileInputStream(file).use { it.copyTo(out) } }
            contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) {
            contentResolver.delete(uri, null, null); throw e
        }
        val where = if (isImage) "갤러리의 '사진쏙' 앨범" else "'내 파일 → 다운로드 → 사진쏙' 폴더"
        return JSONObject().put("status", "saved").put("where", where)
    }

    // ---- 공간 확보: 갤러리 읽기(권한 필요), 줄인 사진 저장, 원본 휴지통 ----
    private fun cleanupSupported() = Build.VERSION.SDK_INT >= 30

    private fun mediaPermissions(): Array<String> = when {
        Build.VERSION.SDK_INT >= 34 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
        Build.VERSION.SDK_INT >= 33 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    private fun granted(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    private fun mediaStatus(): String = when {
        !cleanupSupported() -> "unsupported"
        Build.VERSION.SDK_INT >= 33 && granted(Manifest.permission.READ_MEDIA_IMAGES) -> "granted"
        Build.VERSION.SDK_INT < 33 && granted(Manifest.permission.READ_EXTERNAL_STORAGE) -> "granted"
        Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) -> "partial"
        else -> "denied"
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != PERM) return
        val status = mediaStatus()
        // 거절했고 다시 물을 수도 없으면 설정 화면으로 안내한다.
        val blocked = status == "denied" && !shouldShowRequestPermissionRationale(mediaPermissions()[0])
        web.evaluateJavascript("window.PhotoSokCleanup && PhotoSokCleanup.onPermission('$status', $blocked)", null)
    }

    private val imagesUri: Uri get() = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

    /** /media/list/big/<최소바이트>.json, /media/list/recent/<개수>.json, /media/thumb/<id>/<px>, /media/full/<id> */
    private inner class MediaFiles : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            if (mediaStatus().let { it != "granted" && it != "partial" }) return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, null)
            val parts = path.substringBefore('?').split('/')
            return try {
                when (parts.getOrNull(0)) {
                    "list" -> {
                        val mode = parts.getOrNull(1) ?: "big"
                        val n = parts.getOrNull(2)?.substringBefore(".json")?.toLongOrNull() ?: 0L
                        val json = listImages(mode, n).toString()
                        WebResourceResponse("application/json", "utf-8", ByteArrayInputStream(json.toByteArray()))
                    }
                    "thumb" -> {
                        val id = parts[1].toLong(); val px = (parts.getOrNull(2)?.toIntOrNull() ?: 160).coerceIn(32, 512)
                        val bmp = contentResolver.loadThumbnail(android.content.ContentUris.withAppendedId(imagesUri, id), Size(px, px), null)
                        val out = ByteArrayOutputStream(); bmp.compress(Bitmap.CompressFormat.JPEG, 85, out); bmp.recycle()
                        WebResourceResponse("image/jpeg", null, ByteArrayInputStream(out.toByteArray()))
                    }
                    "full" -> {
                        val uri = android.content.ContentUris.withAppendedId(imagesUri, parts[1].toLong())
                        WebResourceResponse(contentResolver.getType(uri) ?: "image/jpeg", null, contentResolver.openInputStream(uri))
                    }
                    else -> null
                }
            } catch (e: Exception) {
                WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null)
            }
        }
    }

    private fun listImages(mode: String, n: Long): JSONArray {
        val cols = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.SIZE, MediaStore.Images.Media.WIDTH, MediaStore.Images.Media.HEIGHT,
            MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.DATE_MODIFIED, MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.RELATIVE_PATH, MediaStore.Images.Media.BUCKET_DISPLAY_NAME, MediaStore.Images.Media.OWNER_PACKAGE_NAME)
        val big = mode == "big"
        val selection = if (big) "${MediaStore.Images.Media.SIZE} >= ?" else null
        val args = if (big) arrayOf(n.toString()) else null
        val order = if (big) "${MediaStore.Images.Media.SIZE} DESC" else "${MediaStore.Images.Media.DATE_TAKEN} DESC"
        val limit = if (big) 3000 else n.coerceIn(1, 5000).toInt()
        val list = JSONArray()
        contentResolver.query(imagesUri, cols, selection, args, order)?.use { c ->
            while (c.moveToNext() && list.length() < limit) {
                val taken = c.getLong(4).takeIf { it > 0 } ?: (c.getLong(5) * 1000)
                list.put(JSONObject().put("id", c.getLong(0)).put("size", c.getLong(1)).put("w", c.getInt(2)).put("h", c.getInt(3))
                    .put("date", taken).put("mime", c.getString(6) ?: "").put("name", c.getString(7) ?: "")
                    .put("path", c.getString(8) ?: "").put("album", c.getString(9) ?: "").put("mine", c.getString(10) == packageName))
            }
        }
        return list
    }

    private val EXIF_TAGS = arrayOf(
        ExifInterface.TAG_DATETIME, ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED,
        ExifInterface.TAG_OFFSET_TIME, ExifInterface.TAG_OFFSET_TIME_ORIGINAL, ExifInterface.TAG_OFFSET_TIME_DIGITIZED,
        ExifInterface.TAG_SUBSEC_TIME, ExifInterface.TAG_SUBSEC_TIME_ORIGINAL, ExifInterface.TAG_SUBSEC_TIME_DIGITIZED,
        ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL, ExifInterface.TAG_LENS_MAKE, ExifInterface.TAG_LENS_MODEL,
        ExifInterface.TAG_F_NUMBER, ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
        ExifInterface.TAG_FOCAL_LENGTH, ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM, ExifInterface.TAG_FLASH,
        ExifInterface.TAG_WHITE_BALANCE, ExifInterface.TAG_EXPOSURE_BIAS_VALUE, ExifInterface.TAG_METERING_MODE,
        ExifInterface.TAG_APERTURE_VALUE, ExifInterface.TAG_SHUTTER_SPEED_VALUE, ExifInterface.TAG_BRIGHTNESS_VALUE,
        ExifInterface.TAG_ARTIST, ExifInterface.TAG_COPYRIGHT, ExifInterface.TAG_IMAGE_DESCRIPTION, ExifInterface.TAG_USER_COMMENT,
        ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF,
        ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF, ExifInterface.TAG_GPS_TIMESTAMP, ExifInterface.TAG_GPS_DATESTAMP,
        ExifInterface.TAG_GPS_PROCESSING_METHOD, ExifInterface.TAG_GPS_IMG_DIRECTION, ExifInterface.TAG_GPS_IMG_DIRECTION_REF,
    )

    /** 줄인 사진(file)을 원본(id)과 같은 앨범에 새 사진으로 넣는다. 찍은 날짜·사진 정보(EXIF)는 원본에서 옮긴다. */
    private fun storeReplacement(file: File, originalId: Long): JSONObject {
        val orig = android.content.ContentUris.withAppendedId(imagesUri, originalId)
        var name = "photo.jpg"; var rel = Environment.DIRECTORY_PICTURES + "/사진쏙/"; var taken = 0L
        contentResolver.query(orig, arrayOf(MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.RELATIVE_PATH, MediaStore.Images.Media.DATE_TAKEN), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                name = c.getString(0) ?: name
                val p = c.getString(1) ?: ""
                if (p.startsWith(Environment.DIRECTORY_DCIM + "/") || p.startsWith(Environment.DIRECTORY_PICTURES + "/")) rel = p
                taken = c.getLong(2)
            }
        }
        runCatching {
            val src = contentResolver.openInputStream(orig)!!.use { ExifInterface(it) }
            val dst = ExifInterface(file.absolutePath)
            for (tag in EXIF_TAGS) src.getAttribute(tag)?.let { dst.setAttribute(tag, it) }
            dst.setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL.toString())
            dst.saveAttributes()
        }
        val stem = name.substringBeforeLast('.')
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "${stem}_s.jpg")
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            put(MediaStore.MediaColumns.RELATIVE_PATH, rel)
            if (taken > 0) put(MediaStore.Images.Media.DATE_TAKEN, taken)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = contentResolver.insert(imagesUri, values) ?: throw IllegalStateException("insert")
        try {
            contentResolver.openOutputStream(uri)!!.use { out -> FileInputStream(file).use { it.copyTo(out) } }
            contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) {
            contentResolver.delete(uri, null, null); throw e
        }
        return JSONObject().put("status", "saved").put("id", android.content.ContentUris.parseId(uri)).put("size", file.length())
    }

    // ---- 광고 (애드몹) ----
    // 아래 배너 하나 + 저장이 끝나면 올라오는 "저장했어요" 카드 속 네이티브 광고(처음 한 번은 건너뛰고, 그 뒤 2번에 1번, 1분 30초 간격).
    // 보상형: 사용자가 원하면 광고 한 편을 보고 24시간 동안 광고 없이 쓴다.
    private fun adFreeUntil(): Long = prefs.getLong("adFreeUntil", 0L)
    private fun adFree(): Boolean = System.currentTimeMillis() < adFreeUntil()

    private fun setupAds() {
        val params = ConsentRequestParameters.Builder().build()
        consent.requestConsentInfoUpdate(this, params, {
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(this) { _ -> if (consent.canRequestAds()) startAds() }
        }, { _ -> if (consent.canRequestAds()) startAds() })
        if (consent.canRequestAds()) startAds()
    }

    private fun startAds() {
        if (adsStarted) return
        adsStarted = true
        MobileAds.initialize(this) {}
        runOnUiThread { loadBanner(); loadNative(); loadRewarded() }
    }

    private fun applyBannerVisibility() {
        if (!::adBox.isInitialized) return
        adBox.visibility = if (bannerWanted && !adFree()) View.VISIBLE else View.GONE
    }

    override fun onResume() {
        super.onResume()
        if (::adBox.isInitialized) applyBannerVisibility()
    }

    private fun loadBanner() {
        val widthDp = (resources.displayMetrics.widthPixels / resources.displayMetrics.density).toInt()
        val view = AdView(this)
        view.adUnitId = BuildConfig.ADMOB_BANNER
        view.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp))
        view.adListener = object : AdListener() {
            override fun onAdFailedToLoad(error: LoadAdError) { /* 광고가 없으면 자리만 비워 둔다 */ }
        }
        adBox.removeAllViews()
        adBox.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        adView = view
        view.loadAd(AdRequest.Builder().build())
        applyBannerVisibility()
    }

    private fun loadNative() {
        if (isDestroyed) return
        AdLoader.Builder(this, BuildConfig.ADMOB_NATIVE)
            .forNativeAd { ad -> if (isDestroyed) ad.destroy() else { nativeAd?.destroy(); nativeAd = ad } }
            .withAdListener(object : AdListener() { override fun onAdFailedToLoad(error: LoadAdError) { nativeAd = null } })
            .withNativeAdOptions(NativeAdOptions.Builder().setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT).build())
            .build()
            .loadAd(AdRequest.Builder().build())
    }

    private fun loadRewarded() {
        RewardedAd.load(this, BuildConfig.ADMOB_REWARDED, AdRequest.Builder().build(), object : RewardedAdLoadCallback() {
            override fun onAdLoaded(ad: RewardedAd) { rewarded = ad }
            override fun onAdFailedToLoad(error: LoadAdError) { rewarded = null }
        })
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()
    private fun rounded(color: Int, radius: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }

    /** 저장이 끝났을 때. 규칙에 맞으면 "저장했어요" 카드를 아래에서 띄우고 그 안에 네이티브 광고를 보여 준다. */
    private fun adBreak(where: String) {
        adBreaks++
        val now = System.currentTimeMillis()
        if (adFree() || adBreaks < 2 || adBreaks % 2 != 0 || now - lastSheetAt < 90_000) return
        val ad = nativeAd ?: return
        nativeAd = null
        lastSheetAt = now
        showSavedSheet(ad, where)
        loadNative()
    }

    private fun showSavedSheet(ad: NativeAd, where: String) {
        val bg = if (dark) 0xFF1B1E20.toInt() else Color.WHITE
        val fg = if (dark) 0xFFF2F3F1.toInt() else 0xFF111111.toInt()
        val muted = if (dark) 0xFF9AA0A6.toInt() else 0xFF6B7075.toInt()
        val lime = 0xFFC8F04A.toInt()
        val dialog = Dialog(this)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(18))
            background = GradientDrawable().apply { setColor(bg); setCornerRadii(floatArrayOf(dp(24).toFloat(), dp(24).toFloat(), dp(24).toFloat(), dp(24).toFloat(), 0f, 0f, 0f, 0f)) }
        }
        box.addView(TextView(this).apply { text = "저장했어요"; setTextColor(fg); textSize = 20f; setTypeface(typeface, Typeface.BOLD) })
        if (where.isNotBlank()) box.addView(TextView(this).apply { text = "$where 에서 확인하세요."; setTextColor(muted); textSize = 14f; setPadding(0, dp(4), 0, dp(14)) })

        // 네이티브 광고: 아이콘·제목·설명·이미지·버튼, 그리고 "광고" 표시
        val adView = NativeAdView(this)
        val inner = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(14), dp(12), dp(14), dp(14)); background = rounded(if (dark) 0xFF24282B.toInt() else 0xFFF3F4F2.toInt(), 16) }
        val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val badge = TextView(this).apply { text = "광고"; setTextColor(0xFF111111.toInt()); textSize = 11f; setTypeface(typeface, Typeface.BOLD); setPadding(dp(6), dp(1), dp(6), dp(1)); background = rounded(lime, 6) }
        val icon = ImageView(this).apply { layoutParams = LinearLayout.LayoutParams(dp(40), dp(40)).apply { marginStart = dp(8); marginEnd = dp(10) } }
        val headline = TextView(this).apply { setTextColor(fg); textSize = 15f; setTypeface(typeface, Typeface.BOLD); maxLines = 2; layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f) }
        top.addView(badge); top.addView(icon); top.addView(headline)
        inner.addView(top)
        val body = TextView(this).apply { setTextColor(muted); textSize = 13f; maxLines = 2; setPadding(0, dp(8), 0, dp(8)) }
        inner.addView(body)
        val media = MediaView(this).apply { layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(170)) }
        inner.addView(media)
        val cta = Button(this).apply { isAllCaps = false; setTextColor(0xFF111111.toInt()); textSize = 15f; background = rounded(lime, 12); layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(46)).apply { topMargin = dp(10) } }
        inner.addView(cta)
        adView.addView(inner)
        adView.headlineView = headline; headline.text = ad.headline
        adView.bodyView = body; body.text = ad.body ?: ""; body.visibility = if (ad.body.isNullOrBlank()) View.GONE else View.VISIBLE
        adView.iconView = icon; ad.icon?.drawable?.let { icon.setImageDrawable(it) } ?: run { icon.visibility = View.GONE }
        adView.mediaView = media; ad.mediaContent?.let { media.setMediaContent(it) } ?: run { media.visibility = View.GONE }
        adView.callToActionView = cta; cta.text = ad.callToAction ?: "자세히 보기"; cta.visibility = if (ad.callToAction.isNullOrBlank()) View.GONE else View.VISIBLE
        adView.setNativeAd(ad)
        box.addView(adView)

        val close = Button(this).apply { text = "닫기"; isAllCaps = false; setTextColor(fg); textSize = 15f; background = ColorDrawable(Color.TRANSPARENT); layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(8) } }
        close.setOnClickListener { dialog.dismiss() }
        box.addView(close)

        dialog.setContentView(box)
        dialog.setOnDismissListener { ad.destroy() }
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setGravity(Gravity.BOTTOM)
        }
        dialog.show()
    }

    /** 보상형 광고를 끝까지 보면 24시간 광고 없이. 결과는 PhotoSokAds.onReward(만료 시각)로 알린다. */
    private fun showRewarded() {
        val ad = rewarded
        if (ad == null) {
            loadRewarded()
            web.evaluateJavascript("window.PhotoSokAds && PhotoSokAds.onReward(0, 'notready')", null)
            return
        }
        rewarded = null
        var earned = false
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                loadRewarded()
                val until = if (earned) adFreeUntil() else 0L
                applyBannerVisibility()
                web.evaluateJavascript("window.PhotoSokAds && PhotoSokAds.onReward($until, '${if (earned) "ok" else "skipped"}')", null)
            }
            override fun onAdFailedToShowFullScreenContent(error: com.google.android.gms.ads.AdError) {
                loadRewarded()
                web.evaluateJavascript("window.PhotoSokAds && PhotoSokAds.onReward(0, 'failed')", null)
            }
        }
        ad.show(this) { _ ->
            earned = true
            prefs.edit().putLong("adFreeUntil", System.currentTimeMillis() + 24L * 3600_000L).apply()
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun begin(name: String, mime: String): String {
            val id = UUID.randomUUID().toString()
            val dir = File(outDir, id).apply { mkdirs() }
            val file = File(dir, safeName(name))
            file.writeBytes(ByteArray(0))
            synchronized(outFiles) { outFiles[id] = file }
            return id
        }

        @JavascriptInterface
        fun append(id: String, base64: String): Boolean {
            val file = synchronized(outFiles) { outFiles[id] } ?: return false
            FileOutputStream(file, true).use { it.write(Base64.decode(base64, Base64.DEFAULT)) }
            return true
        }

        @JavascriptInterface
        fun save(id: String, mime: String): String = try {
            val file = synchronized(outFiles) { outFiles.remove(id) } ?: throw IllegalStateException("missing")
            val result = saveToDevice(file, mime)
            file.parentFile?.deleteRecursively()
            result.toString()
        } catch (e: Exception) {
            JSONObject().put("status", "failed").put("message", "저장하지 못했어요. 저장 공간을 확인하고 다시 시도해주세요.").toString()
        }

        @JavascriptInterface
        fun share(idsJson: String): String = try {
            val ids = JSONArray(idsJson)
            val uris = ArrayList<Uri>()
            val mimes = HashSet<String>()
            for (i in 0 until ids.length()) {
                val file = synchronized(outFiles) { outFiles.remove(ids.getString(i)) } ?: continue
                uris.add(FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file))
                mimes.add(mimeOf(file.name))
            }
            if (uris.isEmpty()) throw IllegalStateException("empty")
            val type = if (mimes.size == 1) mimes.first() else if (mimes.all { it.startsWith("image/") }) "image/*" else "*/*"
            val send = if (uris.size == 1) Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
                       else Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            send.type = type
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            send.clipData = ClipData.newRawUri("files", uris[0]).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }
            runOnUiThread { startActivity(Intent.createChooser(send, "보낼 곳 고르기")) }
            JSONObject().put("status", "shared").toString()
        } catch (e: Exception) {
            JSONObject().put("status", "failed").put("message", "공유 창을 열지 못했어요.").toString()
        }

        @JavascriptInterface
        fun setTheme(theme: String) {
            runOnUiThread { applyBars(theme == "dark") }
        }

        @JavascriptInterface
        fun takeShared(): String = synchronized(pendingShared) {
            val list = JSONArray(pendingShared.toList()); pendingShared.clear(); list.toString()
        }

        // ---- 광고 ----
        @JavascriptInterface
        fun setBanner(visible: Boolean) {
            runOnUiThread { bannerWanted = visible; applyBannerVisibility() }
        }

        /** 저장 같은 작업이 끝났을 때 부른다. 규칙에 맞을 때만 "저장했어요" 카드(네이티브 광고)를 띄운다. */
        @JavascriptInterface
        fun adBreak(where: String) { runOnUiThread { this@MainActivity.adBreak(where) } }

        @JavascriptInterface
        fun showRewarded() { runOnUiThread { this@MainActivity.showRewarded() } }

        @JavascriptInterface
        fun adFreeUntil(): Long = this@MainActivity.adFreeUntil()

        @JavascriptInterface
        fun adsAvailable(): Boolean = adsStarted

        @JavascriptInterface
        fun adPrivacyRequired(): Boolean =
            consent.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

        @JavascriptInterface
        fun showAdPrivacy() {
            runOnUiThread { UserMessagingPlatform.showPrivacyOptionsForm(this@MainActivity) { _ -> } }
        }

        // ---- 공간 확보 ----
        @JavascriptInterface
        fun mediaStatus(): String = this@MainActivity.mediaStatus()

        @JavascriptInterface
        fun requestMedia() {
            runOnUiThread {
                if (!cleanupSupported()) web.evaluateJavascript("window.PhotoSokCleanup && PhotoSokCleanup.onPermission('unsupported', false)", null)
                else requestPermissions(mediaPermissions(), PERM)
            }
        }

        @JavascriptInterface
        fun openAppSettings() {
            runOnUiThread {
                runCatching { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
            }
        }

        /** 업로드한 줄인 사진(uploadId)을 원본(originalId) 자리에 새 사진으로 저장한다. 원본은 아직 그대로다. */
        @JavascriptInterface
        fun storeReplacement(uploadId: String, originalId: String): String = try {
            val file = synchronized(outFiles) { outFiles.remove(uploadId) } ?: throw IllegalStateException("missing")
            val r = this@MainActivity.storeReplacement(file, originalId.toLong())
            file.parentFile?.deleteRecursively()
            r.toString()
        } catch (e: Exception) {
            JSONObject().put("status", "failed").toString()
        }

        /** 사진들을 휴지통으로 보낸다. 안드로이드가 확인 창을 띄우고, 결과는 PhotoSokCleanup.onTrash 로 온다. */
        @JavascriptInterface
        fun trash(idsJson: String): String = try {
            if (!cleanupSupported()) throw IllegalStateException("old")
            val ids = JSONArray(idsJson)
            val uris = (0 until ids.length()).map { android.content.ContentUris.withAppendedId(imagesUri, ids.getLong(it)) }
            if (uris.isEmpty()) throw IllegalStateException("empty")
            val pi = MediaStore.createTrashRequest(contentResolver, uris, true)
            runOnUiThread { startIntentSenderForResult(pi.intentSender, TRASH, null, 0, 0, 0) }
            "asked"
        } catch (e: Exception) { "failed" }

        /** 이 앱이 만든 사진(줄인 사본)을 지운다. 원본 휴지통 보내기를 취소했을 때 사본이 두 벌로 남지 않게 한다. */
        @JavascriptInterface
        fun deleteOwn(idsJson: String): Int {
            val ids = JSONArray(idsJson); var n = 0
            for (i in 0 until ids.length()) runCatching {
                n += contentResolver.delete(android.content.ContentUris.withAppendedId(imagesUri, ids.getLong(i)), null, null)
            }
            return n
        }
    }
}
