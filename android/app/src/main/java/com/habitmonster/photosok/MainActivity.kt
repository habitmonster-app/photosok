package com.habitmonster.photosok

import android.annotation.SuppressLint
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
    }

    private lateinit var web: WebView
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
        setContentView(web)
        web.loadUrl(START)
        handleIncoming(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncoming(intent)
    }

    @Deprecated("Activity back handling")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** 상태바·내비게이션바 색을 화면 모드에 맞춘다. */
    @Suppress("DEPRECATION")
    private fun applyBars(dark: Boolean) {
        val color = if (dark) 0xFF101213.toInt() else 0xFFF3F4F2.toInt()
        window.statusBarColor = color
        window.navigationBarColor = color
        web.setBackgroundColor(color)
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
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (types.size == 1) types[0] else "*/*"
            if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }
        return try { startActivityForResult(intent, PICK); true } catch (e: Exception) { cancelChooser(); false }
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
    }
}
