# Publishing BizCore on Google Play: step by step

**Files:** `release/BizCore-3.0.0.aab` (upload this), `graphics/`, `LISTING.md`, `PRIVACY-POLICY.md`,
`DATA-SAFETY.md`. The bundle is signed with the BizCore upload key (`BizCore-signing-key.zip`,
kept privately; not in this repository).

1. **Developer account:** play.google.com/console → sign up (one-time US$25), choose Personal or
   Organisation, verify identity. Organisation accounts need a D-U-N-S number.
2. **Create app:** name `BizCore`, default language English (India), App, Free.
3. **Set up your app** (dashboard checklist), using `DATA-SAFETY.md`:
   privacy policy URL, app access, ads, content rating, target audience, data safety, financial
   features, government app, news.
4. **Store listing:** copy from `LISTING.md`; upload icon, feature graphic and 2–8 phone screenshots
   from `graphics/`.
5. **Testing first** (required for **new personal accounts**: a closed test with at least
   **12 testers for 14 days** before production is allowed):
   Testing → Closed testing → Create track → add testers' Gmail addresses → Create release →
   upload `BizCore-3.0.0.aab` → release notes "First release" → Review → Start rollout.
   Testers install from the opt-in link and keep it installed for 14 days.
6. **App signing:** on the first upload accept **Play App Signing**. Google keeps the app's signing
   key; our key becomes the **upload key**. Keep `BizCore-signing-key.zip` safe: every future
   upload must be signed with it (if lost, Play support can reset the upload key).
7. **Production:** after the test period, Production → Create release → promote the tested release
   → choose countries (India, and more if wanted) → Review → Start rollout. Google's review usually
   takes from a few hours to a few days.
8. **Updates:** bump `versionCode` and `versionName` in
   `generic-app/android-app/android/app/build.gradle`, run `./gradlew bundleRelease` in
   `generic-app/android-app/android` (with the keystore in `generic-app/android-app/keystore/`),
   upload the new `.aab`.

**Note:** the app id `com.bizcore.app` is permanent once uploaded. If you want a different id
(for example `com.fingertip.bizcore`), it must be changed before the first upload; ask and it will
be changed and rebuilt.
