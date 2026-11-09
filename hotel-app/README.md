# Fingertip Hotel

A fresh app for a hotel with rooms, a restaurant and guests. Same Fingertip pattern:
**header → sub-header → Upload · Download · Combine · Understand**, plus a guest vault
titled with the hotel's name. No sample data, no examples. Plan and reasons: `../docs/PROJECT-VERTICALS.md`.

- `web/plan.js`: the headers and sub-headers (edit here to change the app's structure)
- `web/app.js`: screens and the four actions; data stays on the phone (localStorage, photos in IndexedDB)
- `test/e2e.js`: walks every screen at phone size (`node test/e2e.js`, needs Playwright)
- `android-app/`: Capacitor shell, Android id `biz.fingertrip.hotel` (installs next to Fingertrip.biz AI)

Build the APK (needs Node 22, JDK 21, Android SDK 36 and the signing key in `android-app/keystore/`, never committed):

```
cd android-app && npm ci && node prepare-web.js && npx cap sync android
cd android && ./gradlew assembleRelease
```
Then sign with v1+v2+v3 using `apksigner`, as for the Biz app.

AI ("Explain with AI") uses a Google Gemini key entered in Settings → AI, kept on the phone only.
