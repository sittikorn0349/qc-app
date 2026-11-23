# Packaging

Both packages wrap the installable web app (main app, /qc-app/; v1.0.0), so updates ship by pushing the site.

## Windows (`windows/`)
    npm i
    npx electron-builder --win dir --x64          # -> dist/win-unpacked
    mv "dist/win-unpacked/QC ตรวจงาน.exe" dist/win-unpacked/QC-App.exe
    npm i --no-save resedit pe-library && node seticon.mjs
    makensis installer.nsi                        # -> dist/QC-App-Setup-<ver>.exe (per-user, no admin)
Google sign-in opens in the system browser and returns through `qcapp://auth`
(must be in Supabase Auth → URL Configuration → Redirect URLs).

## Android (`android/`, Trusted Web Activity)
    npx @bubblewrap/cli update --manifest=twa-manifest.json
    ./gradlew assembleRelease bundleRelease
    zipalign + apksigner (apk), jarsigner (aab) with the upload key (kept OUTSIDE git)
Digital Asset Links: https://sittikorn0349.github.io/.well-known/assetlinks.json
