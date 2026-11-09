# Vendored software: provenance and rebuild notes

These files are served by this site; user documents are not sent to their upstream projects. The upstream projects do not endorse this application. Full license texts are linked from `../licenses.html`; license terms, notices and copyright statements take precedence over this summary.

## Versioned inputs

| Component | Version / origin | Local artifact |
| --- | --- | --- |
| pdf-lib | 1.17.1; https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz ; https://github.com/Hopding/pdf-lib/tree/v1.17.1 | `pdf-lib.min.js`, byte-identical to the package's `dist/pdf-lib.min.js` |
| PDF.js (`pdfjs-dist`) | 6.5.438, build 0a4153349; https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz ; https://github.com/mozilla/pdf.js/tree/v6.5.438 | Package `legacy/build/pdf.min.mjs`, `pdf.worker.min.mjs`, `pdf.renderer.min.mjs`, renamed to `pdfjs/pdf.mjs`, `pdf.worker.mjs`, `pdf.renderer.mjs`. Contents unchanged. |
| PDF.js resources | Same pdfjs-dist package | `cmaps/`, `standard_fonts/`, `wasm/`, `iccs/`, including upstream license files; contents unchanged. |
| heic-to | 1.6.7; https://registry.npmjs.org/heic-to/-/heic-to-1.6.7.tgz ; https://github.com/hoppergee/heic-to | Package `dist/next/heic-to.js`, renamed to `heic-to/heic-to.js`; contents unchanged. `src/`, `package.json` and `esbuild.mjs` are original package source/build files. |
| libheif | 1.23.7, as identified by heic-to 1.6.7's release table | Embedded Emscripten decoder in heic-to; upstream source archive `heic-to/sources/libheif-1.23.7.tar.gz` |
| libde265 | 1.0.16, as specified by heic-to 1.6.7's documented build command | HEVC decoder used by the libheif build; upstream source archive `heic-to/sources/libde265-1.0.16.tar.gz` |
| MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) | 1.1.1; https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.1.1.tgz ; Apache-2.0 | `mediapipe/vision_bundle.mjs`, `mediapipe/wasm/vision_wasm_internal.js`, `mediapipe/wasm/vision_wasm_internal.wasm`; contents unchanged. License: `mediapipe/LICENSE`. |
| MediaPipe models | Face Landmarker float16 v1 and Selfie Segmenter float16 (latest), from https://storage.googleapis.com/mediapipe-models/ ; Apache-2.0 per MediaPipe model cards | `mediapipe/face_landmarker.task`, `mediapipe/selfie_segmenter.tflite`; unchanged. Used only on the device. |

`heic-to/UPSTREAM-README.md` preserves the package's version table and build instructions. Both decoder archives were obtained from the exact upstream tags. Their URLs, byte lengths and SHA-256 checksums are in `heic-to/sources/source-archives.json`. The published package does not specify the exact Emscripten toolchain version or every build-environment detail; a byte-for-byte reconstruction of its compiled decoder has not been established. We have not modified the vendored libraries. Application-specific adaptation is in the separate, readable `../heic-support.js`, `../heic-worker.js` and `../pdf-tools.js` files.

## Notices included with the bundles

- pdf-lib: Copyright (c) 2019 Andrew Dillon, MIT (`pdf-lib-LICENSE.md`). Associated bundled modules: @pdf-lib/standard-fonts (Andrew Dillon, MIT), @pdf-lib/upng (Photopea, MIT), pako (Vitaly Puzrin and Andrei Tuputcyn, MIT, plus zlib's notice). Their license copies are provided separately. The Microsoft runtime's Apache-2.0 notice remains embedded at the start of the pdf-lib bundle; the full Apache license is also supplied at `pdfjs/LICENSE`. The dependency versions installed alongside the published bundle are not used to infer exact embedded runtime versions.
- PDF.js: Mozilla Foundation, Apache-2.0. Its legacy bundle also identifies core-js 3.51.0; the corresponding MIT license is copied from https://raw.githubusercontent.com/zloirock/core-js/v3.51.0/LICENSE to `pdfjs/core-js-LICENSE`.
- PDF.js CMaps: Adobe Systems Incorporated; retained three-clause redistribution notice. Foxit standard fonts: PDFium Authors, retained BSD-style notice. Liberation fonts: **the bundled text is GPLv2 with its font exception**, not the license of a different Liberation release. ICC profile: CC0 1.0.
- PDF.js decoder resources: qcms and wrapper (MIT), OpenJPEG and wrapper (BSD-2-Clause), QuickJS and wrapper (MIT), JBIG2/PDFium and the additional notices in `wasm/LICENSE_JBIG2`; Mozilla's JBIG2 wrapper is Apache-2.0. All original component license files remain alongside the assets.
- heic-to: Hopper Gee, package metadata `LGPL-3.0`; its supplied LICENSE expressly permits version 3 or any later version. libheif and libde265 libraries use LGPLv3 terms; their archive COPYING/source files provide the grants and component notices. Full GPLv3, which LGPLv3 incorporates, is supplied as `heic-to/GPL-3.0.txt`. The sample applications/wrappers in the upstream archives may have separate licenses; consult those source files.

## Rebuild or replace heic-to

The readable heic-to sources and existing compiled decoder are available next to the shipped bundle. To change the JavaScript wrapper, copy this `heic-to/` directory into a separate working directory, install its documented build dependency, and build:

```sh
npm install --ignore-scripts --no-audit --no-fund --save-dev esbuild@0.25.4
node esbuild.mjs
```

The application uses the worker-compatible `dist/next/heic-to.js` output. Copy that generated file over this site's `dist/vendor/heic-to/heic-to.js`, preserve the license files, and serve the whole site over HTTP(S). No bundle signature or integrity hash in the application prevents replacing the library. `CHECKSUMS.json` is an informational record, not an integrity lock.

To modify the underlying decoder, use the supplied libheif/libde265 source archives. The following follows the upstream recipe; it requires an activated Emscripten SDK, CMake, make, pkg-config and autotools/libtool. It is a rebuild guide, not a claim that this environment was used to create the published npm bytes.

```sh
tar -xf libheif-1.23.7.tar.gz
mkdir libheif-1.23.7/buildjs
cp libde265-1.0.16.tar.gz libheif-1.23.7/buildjs/
cd libheif-1.23.7/buildjs
LIBDE265_VERSION=1.0.16 USE_WASM=0 ../build-emscripten.sh ..
```

Copy the generated `libheif.js` to heic-to's `src/lib/libheif.js`. For the second source variant, run the build in a separate directory with `LIBDE265_VERSION=1.0.16 USE_UNSAFE_EVAL=0 USE_WASM=0` and copy that generated file to `src/lib/libheif-without-unsafe-eval.js`. Then run heic-to's `node esbuild.mjs` and replace the site's worker-compatible output as described above. The upstream README describes a macOS-specific `llvm-nm` path adjustment; the supplied libheif script uses the SDK path by default. Build tools and platforms may require additional setup.

## Refresh PDF dependencies

Install the exact npm versions above in a separate work directory. Copy the matching package paths from the table, preserve all supplemental license/resource files, and rerun this application's PDF tests. Upstream development/build instructions are at https://github.com/Hopding/pdf-lib and https://github.com/mozilla/pdf.js. The app does not require a PDF.js server or CDN at runtime.
