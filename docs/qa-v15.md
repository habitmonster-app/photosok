# v1.5 validation

- Browser integration: 19 checks passed, 0 failed. Existing tests/submission-checks.html updated only for the new chooser label. PDF import, mixed pages, preservation/raster target, rotate, correct/restore, stale/cancel behavior, save delegation, photo output and clearing all passed.
- Manual photo resize: two synthetic document images produced 571x800 results at 34.5KB and 38.7KB. Resize/convert mode selection, settings headings and WebP selection were exercised.
- Desktop and mobile visual inspection: new logo/illustrations load; 390px iframe has 375px layout viewport after its scrollbar, and content width375px (no horizontal overflow).
- JavaScript syntax, index ID uniqueness, local script/style/image references, script order and SVG XML checked.
- No third-party vendor file changed. Compression, PDF and HEIC engine behavior remains outside this presentation refactor. Existing engine checks from v1.4 are not claimed as rerun.
- Screenshots: photo-light-v15.png and photo-light-v15-mobile.png. Real Android/iOS native saving not tested in this update.
