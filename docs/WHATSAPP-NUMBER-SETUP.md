# WhatsApp bot number: setup record

The PIN is **not** stored here. The owner keeps it privately. Never put a PIN, access token or app secret in this repo or in chat.

## Where things are (24 Nov 2026)

| Item | Value |
|---|---|
| Business portfolio | Rx Fingertip, ID 1785366539172769 (business verification: Verified, 21 Nov 2026) |
| WhatsApp account (WABA) for the real number | Rx Fingertip, ID 1587466106402736 (status: Approved) |
| Bot phone number | +91 78424 49808, display name "Rx Fingertip" |
| Phone number ID | 1306304762575933 |
| Meta app | "Birds eye view" (internal name only; customers see "Rx Fingertip") |
| Webhook | Already points to the Supabase function at `https://fsftbvchnifshndssowe.supabase.co/functions/v1/…` |
| Test WhatsApp account | Test WhatsApp Business Account, ID 1098694666453130, test number +1 555 145 5973 (Connected, quality High) |
| Unused WhatsApp account | Rx Fingertip, ID 1101885639290441 (no numbers) |

Other portfolios on the same Facebook login: "Health care notifications" (1440996944155221, **ad account restricted**) and "fingertip.com" (1669197834633344). Don't create more portfolios or WhatsApp accounts.

## Steps done (24 Nov 2026, by the owner on their phone, guided by Claude)

1. SIM for +91 78424 49808 recovered from the mobile company and activated. Not installed in WhatsApp or WhatsApp Business on any phone, and must stay that way.
2. Number verified in WhatsApp Manager with a code by phone call: status went from Unverified to Pending.
3. In Graph API Explorer, app "Birds eye view": access token regenerated with `whatsapp_business_management` and `whatsapp_business_messaging`, and access granted to all three WhatsApp accounts.
4. `GET 1587466106402736/phone_numbers` confirmed `code_verification_status: VERIFIED` and phone number ID 1306304762575933.
5. `POST 1306304762575933/register?messaging_product=whatsapp&pin=<owner's PIN>` returned `{"success": true}`. The number is registered for the Cloud API.

## Still to do

- [ ] `POST 1587466106402736/subscribed_apps`, so messages to the new number reach the app's webhook.
- [ ] Check the bot's Supabase secrets (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) work for this WhatsApp account. The token must be allowed to send from WABA 1587466106402736. This is a job for the session that owns the bot code.
- [ ] Send **SEVA** from another phone to +91 78424 49808 and confirm the bot replies.
- [ ] Display name "Rx Fingertip" approval, and the yellow "WhatsApp needs more information" warning in Business settings. The website is currently a Google Doc link; a real website showing the business name is likely needed.
- [ ] Add a payment method before sending messages the bot starts itself (templates).
- [ ] Add a second admin to the Rx Fingertip portfolio, and turn on two-factor authentication for it.
- [ ] Optional: rename the app "Birds eye view" (App settings → Basic) once the bot works.

## Rules

- Keep the SIM active and recharged.
- No WhatsApp app on this number.
- No medicine sales or offers over WhatsApp (Meta Commerce Policy). Order updates and reminders are fine.
- Only people click in Meta while any restriction is open; no AI agents logged into Facebook or Meta.
