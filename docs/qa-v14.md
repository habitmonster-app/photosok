# v1.4 verification

Chromium browser: 94 checks passed, 0 failed. See qa-v14.json and tests/*.html.

- PDFTools: 11; HEIC: 12; document geometry: 9; file delivery capability mocks: 15; screen integration: 19; photo regression: 17; photo-to-PDF regression: 11.
- Independent pdftotext extraction from downloaded preserved-reordered.pdf retained BETA then ALPHA text. Raster target PDF was 343,655 bytes (under 1,000,000) with no extracted text, as disclosed by the UI.
- HEIC fixture decoded locally at 640x480; larger 4200x3000 fixture reduced to 4096x2925. Worker cleanup/cancellation checks passed.
- Native OS save/share and real iPhone/Android devices were not tested. Delivery checks mock capabilities and errors.
- Cloud filechooser automation failed with DOM.setFileInputFiles node-not-found during preview reload. Import behavior is covered by real generated PDF/photo/HEIC engine tests and the integration harness, not an end-to-end physical-device file picker check.
- All application JS passed syntax checks; index IDs and local script/style links checked.

- Manual app UI: loaded demo, adjusted top-left corner by keyboard, applied correction, observed restore control and corrected page, generated a 2-page 344,453-byte PDF under the 1MB limit. Screenshot: photo-light-v14.png.
