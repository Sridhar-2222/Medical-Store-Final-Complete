# Security basics before the pilot

For: Sri Vasudeva Medical Agencies (Rx Fingertip, Fingertrip.biz AI, Vault).
Do one step at a time. Tick each box when done. All steps work from a phone.

---

## 1. Two-step sign-in (do these first)

Two-step sign-in means a thief needs your phone as well as your password.
Install a free code app first: **Google Authenticator** or **Microsoft Authenticator**.

- [ ] **Google account** (protects Gmail and Lovable if you sign in with Google)
  myaccount.google.com → Security → 2-Step Verification → Turn on.
- [ ] **Supabase** (holds all shop and patient data)
  supabase.com → your profile picture → Account preferences → Security → Add an authenticator app.
- [ ] **GitHub** (holds all app code)
  github.com → profile picture → Settings → Password and authentication → Enable two-factor authentication.
  Save the recovery codes it shows (screenshot, then keep the picture somewhere safe offline).
- [ ] **Lovable**
  If you sign in to Lovable with Google or GitHub, the steps above already protect it.
  If you use an email and password there, change it to a long password used nowhere else.
- [ ] **Meta / Facebook** (needed later for WhatsApp)
  Facebook → Settings → Accounts Center → Password and security → Two-factor authentication.

Never share these codes with anyone, including anyone who says they are from support.

---

## 2. Two small Supabase settings

- [ ] Supabase → Project settings → Data API → turn **off** "Automatically expose new tables".
  (Current tables keep working. New tables stay hidden until they are deliberately opened.)
- [ ] Supabase → Authentication → Sign In / Providers → Email: keep "Confirm email" **on**.

Leaked-password protection needs the paid Pro plan. It is not urgent while sign-in uses email codes.

---

## 3. One tested backup

The free Supabase plan does **not** keep backups you can restore.

Choose one:
- **Pro plan** (about US$25 a month): Supabase keeps daily backups automatically.
- **Free, monthly copy**: ask Claude, in a session given the database password
  (Supabase → Project settings → Database), to make a full copy of the database
  and save it to your Google Drive.

A backup counts only after it has been tested once:
- [ ] Restore the copy into an empty test project and check that shops, bills and patients appear.
- [ ] Write down the date of the last tested backup: ____________

---

## 4. Privacy note (to show in the app)

> Your information is stored securely and is used only to run your shop or your
> health records. Only you and the people you allow can see it. We never sell your
> information. Patient health records are kept separately with stricter protection.
> You can ask us to show, correct or delete your information at any time.
> Contact: Sri Vasudeva Medical Agencies, Karimnagar, [phone], [email].

This follows India's Digital Personal Data Protection Act, 2023: say what you collect,
why, and how people can ask to see, correct or delete it.

---

## 5. If something leaks

Do these in order, the same day:

1. **Change passwords** on the account that leaked (Google, Supabase, GitHub, Lovable, Meta).
2. **Sign out everywhere**: each of those sites has "Sign out of all devices" or "Sessions".
3. **Replace keys**: Supabase → Project settings → API Keys → create new keys and remove the old ones.
   (The app will need the new key put in. Ask Claude to do this part.)
4. **Find out what was seen**: Supabase → Logs. Ask Claude to read them.
5. **Tell the people affected** by WhatsApp or phone: what happened, what was seen, what you did.
6. If personal or health data was seen, report it to the **Data Protection Board of India**
   as the 2023 Act requires.
7. Write down what happened and the date, so it does not happen again.

Keep a paper copy of this page somewhere safe.
