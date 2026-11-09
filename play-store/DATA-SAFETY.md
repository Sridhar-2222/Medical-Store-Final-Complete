# Play Console: Data safety, content rating and app declarations

Suggested answers (check them against how you will actually run the app).

## Data safety (App content → Data safety)
- **Does your app collect or share any of the required user data types?** Yes, because of the
  optional AI reading (photos you choose are sent to OpenAI / Google when the owner adds a key).
- **Is all data encrypted in transit?** Yes (HTTPS to AI providers; use an https address for your
  office server).
- **Can users request data deletion?** Yes: Erase everything in the app, or uninstall.
- Data types to declare:
  | Type | Collected | Shared | Optional | Purpose |
  |---|---|---|---|---|
  | Photos and videos → Photos | Yes (only sent when AI reading is used) | Yes (AI provider) | Optional | App functionality |
  | Files and docs | No (stay on phone / your own server) | No | – | – |
  | Financial info → Purchase history / Other financial info | No (stays on phone / your own server) | No | – | – |
  | Personal info (customers' names, phone numbers) | No (stays on phone / your own server) | No | – | – |
- If you never plan to offer AI reading, you can remove it and answer "No data collected".

## Other declarations
- **Ads:** No ads.
- **App access:** All functionality is available without special access (no login).
- **Content rating questionnaire:** category "Utility, productivity, communication or other";
  answer No to violence, sexual content, profanity, drugs, gambling, user-generated content shared
  publicly; "Shares user location": No. Expected rating: Everyone / 3+.
- **Target audience:** 18 and over (business owners and staff). Not designed for children.
- **News app:** No. **COVID-19 apps:** No. **Government app:** No.
- **Financial features:** bookkeeping only; it does not lend, move money, or offer financial
  services. Choose the option that it provides none of the listed financial features.
- **Health:** it does not provide health services (a pharmacy only stores prescription reminders
  for its own customers). Answer accordingly.
