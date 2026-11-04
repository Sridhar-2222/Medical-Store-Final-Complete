# Meta / WhatsApp: safe recovery plan

- **Prepared:** 4 Nov 2026, by Claude Code
- **Based on:** Supabase message logs (`whatsapp_inbox`, `whatsapp_status`), Gmail notices from Meta (2 Nov), and the 15 Oct status doc
- **Limitation:** I have **no access to Meta**. Anything marked *CHECK* must be confirmed on screen by an admin.

---

## 0. Decision: what to recover, and what to avoid

### Recover (keep and repair)
1. **Business portfolio "Rx Fingertip"** and **WhatsApp Business Account 1098694666453130.** This is where the app, the webhook subscription and all message history live. Repairing the lock keeps everything already built.
2. **Meta app "Birds eye view" (App ID 1594826518800459).** It's already linked to the working Supabase webhook.
3. **Sridhar's Facebook profile.** Treat it as the owner/admin account until Business settings shows otherwise. Secure it first (step 1.1).
4. **The business "Health care notifications" (ID 1440996944155221).** Request a review; don't abandon it. First confirm whether it's the same portfolio as "Rx Fingertip" under another name, or a second one (*CHECK*, step 1.2).

### Add (don't replace)
- **Pritham's genuine profile goes in as a second admin** of the *existing* portfolio. Meta recommends at least two admins for recovery. Pritham shouldn't build a parallel portfolio, WhatsApp account or app.

### Avoid
| Don't | Why |
|---|---|
| Create another portfolio, WhatsApp account, app or Facebook profile | Meta treats new assets made after a restriction as **circumvention**, and can restrict all linked accounts, including the new ones. |
| Let AI or "cloud browser" agents (Manus, ChatGPT Agent, Comet, Genspark) log into Facebook/Meta while this is unresolved | The 2 Nov notice cites "automation that doesn't follow our rules". The **actual cause is not yet established**: read Meta's restriction details before blaming anything. Until then, only humans click in Meta, as a precaution. |
| Delete, disconnect or move the WhatsApp account, app, number or Page | That can break ownership and webhook links, and history can't be restored. |
| Remove Sridhar as admin, or change admin roles | The person under review must stay reachable. |
| Generate new access tokens or reset the app secret now | Messages can't be delivered while the account is locked anyway. A new app secret breaks the live webhook (Supabase checks it). Inspect first, change later (Part 4). |
| Register either personal number as the WhatsApp business number | Registering a number on the Cloud API **removes it from the normal WhatsApp app** on that phone. Use a new SIM for the business. |
| Send many messages, or promotional/medicine-sales messages | Meta's Commerce Policy **prohibits selling prescription drugs** through WhatsApp. Order status and reminders are fine; "buy medicines here" offers are not. |
| Share passwords, codes or tokens in chat, including with me | Not needed for any step here. |

---

## Part 1: Account security and ownership (do first, about 30 min)

### 1.1 Secure Sridhar's Facebook account
1. On **Sridhar's own phone**, open Facebook → **Menu → Settings & privacy → Accounts Centre → Password and security → Where you're logged in**.
2. Look for unknown devices or locations. Log out any you don't recognise.
3. **Confirm with the family who changed the password at 10:38 UTC on 2 Nov** (4:08 pm IST). If nobody did, tap **"Secure account"** in Facebook's email "Your password has been changed".
4. Turn on **Two-factor authentication** (Password and security → Two-factor authentication → Authentication app or SMS).
5. **Phone number:** Facebook said +91 78424 49808 (not the WhatsApp test recipient 90595 49808) is now verified on another account (Pritham's). A phone number should belong to **one** Facebook account.
   - If the number belongs to Pritham, remove it from Sridhar's profile: Accounts Centre → Personal details → Contact info.
   - If it belongs to Sridhar, remove it from Pritham's.
   - Keep a separate email on each profile.

### 1.2 Find out who owns what (look only, change nothing)
Signed in as Sridhar on a computer, or the phone browser in desktop mode:
1. Open **business.facebook.com/settings**. Top-left, switch between each business you're in. Write down every business name and ID.
2. In each business, open these pages and note what's listed:
   - **Accounts → WhatsApp accounts.** Is `1098694666453130` here? In which business?
   - **Accounts → Pages.** Is any Page here?
   - **Accounts → Apps.** Is "Birds eye view" here?
   - **Users → People.** Who are the admins? Is Pritham there?
3. Write down:
   - Is **"Health care notifications" (1440996944155221)** the same business as "Rx Fingertip", renamed, or a different one?
   - Which business owns the WhatsApp account and the app?
   - Are there **duplicates** (two businesses, two WhatsApp accounts, two apps)?
4. Repeat steps 1–2 signed in as **Pritham** (on Pritham's own device) and note anything he has created.

Send me the business names, IDs and which items sit where. These aren't secret.

### 1.3 Note about "which account controls the WhatsApp number"
- The WhatsApp account currently uses **Meta's free test number +1 555 145 5973**. It belongs to the WhatsApp account, not to any Facebook profile.
- **Correction (4 Nov):** there are **two different personal numbers ending in 49808**:
  - **+91 90595 49808** is the WhatsApp **test recipient**. The October messages came from it (`wa_id 919059549808` in the stored Meta data).
  - **+91 78424 49808** is the number Facebook says was verified by another Facebook account on 2 Nov. It's a **Facebook login phone**, not part of the WhatsApp setup.
- Neither number is registered as a WhatsApp business number, so nothing needs "recovering" for them on the WhatsApp side. Only the Facebook login phone (78424) needs sorting out in step 1.1.

---

## Part 2: The two restrictions (they are different)

| | Advertising/business restriction | WhatsApp account lock |
|---|---|---|
| Which | "Health care notifications" (1440996944155221), email of 2 Nov 11:44 UTC | WhatsApp account 1098694666453130, error **131031** on 16, 17 and 22 Oct |
| Effect | Can't create or run ads; can't use audiences | Every outgoing WhatsApp message fails |
| Stated reason | "Created or used with an automation that doesn't follow our rules" (account integrity). Specific cause not yet known. | Meta defines 131031 as: account **restricted or disabled for a policy violation**, *or* request data couldn't be verified (e.g. a 2-step PIN). See the stored evidence below. |
| Where to see it | Business Support Home / Account Quality | WhatsApp Manager → Overview, plus Business Support Home |

### 2.0 Stored evidence for 131031 (from Supabase `whatsapp_status.raw`, unedited Meta data)
- Each of our send calls got an **immediate success** from the API: `messages[0].id` returned.
- Seconds later, Meta's **status webhook** reported `status: failed`, `errors[0].code: 131031`, `title: "Business Account locked"`, `error_data.details: "Business account has been locked."`. The first was at 16 Oct 03:34 UTC (`timestamp 1792121694`); later ones matched.
- What this rules in and out:
  - A wrong 2-step PIN shows up when **registering** a number. It isn't part of a send request, and this setup used Meta's test number. So the PIN meaning is unlikely; it hasn't been verified in Meta.
  - The API accepted the calls, so the **access token was valid then**.
  - The **lock happens later, when Meta delivers the message**. That fits an account-level restriction, which only Meta's own status pages (2.2) can confirm.

### 2.1 Request a review of "Health care notifications"
1. Signed in as Sridhar, open **business.facebook.com/business-support-home** (or the **Request review** button in Meta's 2 Nov email).
2. Select **Health care notifications** and find the restricted item → **Request review**.
3. Meta may ask you to confirm identity: an ID selfie video or document. Use **the real person who is the admin**. In the explanation, write plainly:
   - what the business is (a medicine distributor and pharmacy software pilot in Telangana)
   - that no ads were run
   - that the account was managed by hand
   - that any third-party browser tools have been stopped
4. Use the **actual reason Meta shows**; don't guess. Submit **once**. Don't submit repeatedly. Reviews usually take 24 h to a few days.

### 2.2 Investigate the WhatsApp lock (131031)
1. Open **business.facebook.com/wa/manage/home** → choose WhatsApp account **1098694666453130** → **Overview**. Look for a banner like "Account restricted" or "Disabled", with a reason and a **Request review** button. Screenshot it for me.
2. Also check **Business Support Home** → WhatsApp account → **Account quality**. Note any listed **policy** (e.g. Commerce Policy, prescription drugs, or business integrity).
3. If **Request review** is offered, describe the use as **utility notifications only**: order status, bill ready, pickup ready. Say there's **no sale of prescription medicines** over WhatsApp.
4. If it says **"Disabled" with no review**, the account can't be used. Then a WhatsApp account inside the *same* portfolio may be possible after the portfolio is cleared and verified. **Don't create one before then.**
5. Optional, for whoever can use Graph API Explorer as an admin: `GET /1098694666453130?fields=name,account_review_status,health_status`. The `health_status` field lists what is blocking messaging (portfolio, WhatsApp account, app or phone). Don't paste the token anywhere.

### 2.3 Business verification (Meta needs it for a real number)
- Business settings → **Security Center → Start verification**.
- Use the **exact legal name** on the GST certificate, the GST certificate itself, and a bank statement or utility bill with the same name and address.
- You also need a **website on your own domain** showing the same business name and address. **aipharmacy.in is currently a parked page.** Fix that first (publish the app there, or a simple business page) so verification doesn't fail.

---

## Part 3: Facebook Page and portfolio

- **Is a Page required?** Not strictly, for WhatsApp Cloud API. But it helps: the portfolio looks like a real business, it's needed for many verification flows, and it can show the WhatsApp number.
- **Creating it under Pritham's genuine profile is fine.** A Page is created by a person's profile and then **added to the business portfolio** (Business settings → Accounts → Pages → Add → *Add a Page* or *Create a Page*). Ownership then sits with the portfolio, not the person.
- **Page name:** use the **business's legal name as it appears on the GST certificate**.
  - If that's "Sri Vasudeva Medical Agencies", use exactly that.
  - **Rx Fingertip** can be the app or brand name. WhatsApp approves a **display name** only if the website shows its link to the legal business (e.g. "Rx Fingertip by Sri Vasudeva Medical Agencies").
  - If Sri Vasudeva Medical Agencies is a *separate company* (your pilot distributor), **don't** use its name. Use your own legal entity's name.
- **Connecting the Page to WhatsApp:** after the Page is in the same portfolio, go to WhatsApp Manager → **Phone numbers → (number) → Settings → Profile**, or the Page's Settings → **Linked accounts → WhatsApp**. Do this **after** the lock is resolved.
- **Make Pritham an admin of the existing portfolio:**
  1. Sridhar goes to Business settings → **Users → People → Add**.
  2. Enter Pritham's email and choose **Full control (admin)**.
  3. Pritham accepts the email invite on his own device.

---

## Part 4: Technical recovery (only after the lock is lifted)

### Can the Supabase webhook stay?
**Yes.** `https://fsftbvchnifshndssowe.supabase.co/functions/v1/smooth-responder`:
- verifies Meta's handshake
- checks Meta's signature
- saves incoming messages
- records sent/delivered/read/failed

It received real messages in October. It reads `phone_number_id` from each message, so **no code change** is needed for a new number.

### Credentials and where they go (never in chat)
| Name | What it is | Where to find it | Where it goes |
|---|---|---|---|
| `WHATSAPP_APP_SECRET` | The app's secret | developers.facebook.com → My Apps → Birds eye view → **App settings → Basic → App secret** | Supabase → Edge Functions → **Secrets** |
| `WHATSAPP_VERIFY_TOKEN` | Any text you choose | You make it up, e.g. a long random word | Supabase Secrets **and** the app's WhatsApp → Configuration → Webhook "Verify token" |
| `WHATSAPP_ACCESS_TOKEN` | Permanent system-user token | Business settings → **Users → System users → Add** (Admin) → **Assign assets**: app + WhatsApp account (full control) → **Generate token**: app *Birds eye view*, expiry **Never**, permissions `whatsapp_business_messaging` + `whatsapp_business_management` | Supabase Secrets |

Not secret, so send them to me after any change:
- App ID: 1594826518800459
- WhatsApp account ID: 1098694666453130
- Phone Number ID: 1242742535598163, or the new one

**Don't assume which credential is broken.** Evidence from October:
- **Verify token:** worked. Meta's webhook check succeeded on 28 Sep.
- **App secret:** worked. Signed messages passed the signature check and were stored on 16–17 Oct.
- **Access token:** worked. The API accepted sends up to 22 Oct.

Your 15 Oct notes say the token was a *temporary* one, which normally expires within about a day. So it's **probably** expired now, but that hasn't been checked. Confirm before changing anything. After the unlock:
1. Send one test reply.
2. If `whatsapp_status` shows `send_error` with code 190 ("token expired/invalid"), only then replace `WHATSAPP_ACCESS_TOKEN` with a permanent system-user token.

Leave the app secret and verify token alone unless a test shows they fail.

**Updating safely:**
1. Change **one** secret at a time in Supabase: Project → Edge Functions → Secrets → edit → save. The function picks it up on the next request. No redeploy is needed.
2. Then tell me, and I'll run the checks below.

### Test in two separate steps
**A. Receiving** (works even while sending is blocked):
1. From the 9808 phone, send "test in" to the business number. With the test number, 9808 must be on the app's recipient list.
2. I check that a new row appears in `whatsapp_inbox` and the Google Sheet "Inbox" tab.

**B. Sending** (only after the unlock):
1. The bot replies automatically.
2. I check `whatsapp_status` for `api_accepted → sent → delivered → read`, with **no 131031**.
3. Then submit the 6 Utility templates in `docs/whatsapp-templates.md` and test one.

---

## Order of work (summary)
1. Secure Sridhar's account, sort out the 9808 login, confirm the 2 Nov password change.
2. List all businesses, WhatsApp accounts, apps and admins, for both profiles. **Change nothing.**
3. Stop all automated or AI-agent access to Meta.
4. Request a review on "Health care notifications". Check the WhatsApp account's status and request a review if offered.
5. Add Pritham as a second admin of the existing portfolio.
6. Put up a real business website on aipharmacy.in, then start business verification.
7. After the unlock: permanent token → Supabase secret → test receiving, then sending → submit templates.
8. Later: get a new SIM for the real business number, add it to the same WhatsApp account, set the display name, and link the Page.
