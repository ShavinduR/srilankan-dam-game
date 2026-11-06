# Publishing "Dam" on the Google Play Store — Beginner's Guide

Your game is a **PWA** (an installable web app). We put it on Google Play by wrapping it in a
**Trusted Web Activity (TWA)** — a tiny Android app that opens your Vercel site full-screen, with no
browser bar. You do **not** need to learn Android or rewrite the game.

**Big bonus:** after the app is published, every game update you push to GitHub → Vercel shows up in
the Play Store app automatically. You only rebuild the Android package if you change the app name, icon
or package settings.

---

## What you need & how long it takes

| Item | Details |
|---|---|
| Google Play developer account | **US$25 one-time fee**, government ID for identity verification, an Android phone |
| A computer with a browser | For PWABuilder and Play Console |
| **12 testers for 14 days** | New *personal* developer accounts must run a closed test with **at least 12 testers opted-in for 14 days in a row** before they can publish publicly ([Google's rule](https://support.google.com/googleplay/android-developer/answer/14151465)). Start recruiting friends/family now! |
| Total time | Roughly **3–4 weeks** (account verification + 14-day test + review) |

Everything already prepared for you in this repo:

| File | Used for |
|---|---|
| `client/public/manifest.webmanifest` | App name, icons, colours — PWABuilder reads this |
| `client/public/icons/icon-any-*.png`, `icon-maskable-*.png` | Android launcher icons |
| `client/public/privacy.html` | Privacy policy → **https://srilankan-dam-game-sandy.vercel.app/privacy.html** |
| `store-assets/play-icon-512.png` | Play Store app icon (512×512) |
| `store-assets/feature-graphic-1024x500.png` | Play Store feature graphic |
| `store-assets/screenshots/*.png` | 5 phone screenshots (1080×1920) |

---

## Step 1 — Create your Google Play developer account

1. Go to **https://play.google.com/console/signup** and sign in with your Google account.
2. Choose **"Yourself"** (personal account).
3. Pay the **$25** fee.
4. Complete **identity verification** (name, address, ID document). This can take a few days.
5. Verify your Android phone with the **Google Play Console** app when asked.

> ⚠️ Your legal name/address may be shown publicly on the store listing for personal accounts. Read the
> screens carefully.

---

## Step 2 — Build the Android app with PWABuilder (free, ~10 min)

1. Open **https://www.pwabuilder.com**
2. Paste your game URL: `https://srilankan-dam-game-sandy.vercel.app` → **Start**.
3. It shows a report card (Manifest / Service Worker / Security). It should be all green — we prepared this.
4. Click **Package For Stores** → **Android** → **Generate Package**.
5. Fill in the options (click **All Settings** to see them all):

   | Field | Value |
   |---|---|
   | **Package ID** | `com.shavindu.damgame` ⚠️ **permanent — can never be changed later** |
   | App name | `Dam — Sri Lankan Draughts` |
   | Launcher name | `Dam` |
   | App version | `1.0.0` |
   | App version code | `1` (increase by 1 every time you upload a new package) |
   | Host | `srilankan-dam-game-sandy.vercel.app` |
   | Start URL | `/?source=pwa` |
   | Display mode | Standalone |
   | Notification delegation | Off |
   | Location delegation | Off |
   | **Signing key** | **Create new** — fill in your name, "Dam" as organisation, country `LK` |

6. Click **Download**. You get a ZIP containing:
   - `*.aab` — **upload this to Google Play**
   - `*.apk` — install this on your own phone for testing
   - `signing.keystore` + `signing-key-info.txt` — your **upload key**
   - `assetlinks.json` — (we'll make the final version in Step 6)

> 🔐 **BACK UP the ZIP** (Google Drive + a USB stick). If you lose `signing.keystore` and its passwords you
> can't easily update the app. **Never upload it to GitHub** — `.gitignore` already blocks it.

> ⚠️ Don't rename the Vercel project later: the app is tied to `srilankan-dam-game-sandy.vercel.app`.
> (If you'd like a custom domain like `damgame.lk`, set it up **before** this step and use it as the Host.)

---

## Step 3 — Create the app in Play Console

1. Play Console → **Create app**.
2. App name: `Dam — Sri Lankan Draughts` · Default language: **English (United Kingdom)** or **English (US)**
3. App or game: **Game** · Free or paid: **Free**
4. Tick the declarations → **Create app**.

---

## Step 4 — Fill in "Set up your app" (Dashboard checklist)

Google shows a checklist on the app's **Dashboard**. Suggested answers:

| Section | Answer |
|---|---|
| **Privacy policy** | `https://srilankan-dam-game-sandy.vercel.app/privacy.html` |
| **App access** | *All functionality is available without special access* |
| **Ads** | *No, my app does not contain ads* |
| **Content rating** | Category **Game**. Violence / sexuality / gambling / drugs: **No**. "Can users interact or exchange information?" → **Yes** (players see each other's display names). No chat, no location sharing, no purchases. → Expected rating: **Everyone / PEGI 3** (or close) |
| **Target audience** | **13 and over** (13–15, 16–17, 18+). Avoid under-13 — that triggers the stricter "Families" policy |
| **News app** | No |
| **Data safety** | see below |
| **Government app** | No |
| **Financial features** | My app doesn't provide any financial features |
| **Health** | No |

### Data safety form (matches the privacy policy)

- *Does your app collect or share any of the required user data types?* → **Yes**
- *Is all user data encrypted in transit?* → **Yes** (HTTPS / secure WebSockets)
- *Account creation methods* → **My app does not allow users to create an account**
- *Data deletion* → data is not retained (it's deleted automatically when the match ends)
- Data type **Personal info → Name** (the display name):
  - Collected: **Yes** · Shared: **No**
  - Processed ephemerally: **Yes** (kept in memory only during a match)
  - Required or optional: **Optional** (Pass & Play works without it)
  - Purpose: **App functionality**
- Everything else (location, contacts, photos, device IDs, etc.): **not collected**

### Main store listing (Grow → Store presence → Main store listing)

| Field | Content |
|---|---|
| App name | `Dam — Sri Lankan Draughts` |
| Short description (≤80 chars) | `Play traditional Sri Lankan Dam (draughts) online with friends in real time.` |
| Full description | see below |
| App icon | `store-assets/play-icon-512.png` |
| Feature graphic | `store-assets/feature-graphic-1024x500.png` |
| Phone screenshots | all 5 from `store-assets/screenshots/` |
| Category | **Board** |
| Contact email | `shavindu.rashmika928@gmail.com` |

**Full description** (copy & paste, edit freely):

```
Play Dam — the traditional Sri Lankan draughts game — online against real players!

♟ AUTHENTIC SRI LANKAN RULES
• Choose a 12×12 board (30 pieces each) or a 10×10 board (20 pieces each)
• Men move forward but capture both forward AND backward
• Multi-jumps: keep capturing in one turn
• Reach the last row to become a Dam (king)
• Flying kings move and capture across the whole diagonal

💨 THE "BLOW" RULE
Captures aren't forced — but if your opponent misses one, tap their piece before your move to BLOW it off the board! Just like playing on the street.

⏱ FAST, FAIR GAMES
• 90 seconds per move, with a warning at 60 seconds
• "අදින්න" nudge button to hurry up a slow opponent

😂 TEASE YOUR OPPONENT
Quick reactions: හූ.. හූ.. · ඇයි බයද? · අයියෝ · එළකිරි

🔊 Wooden sound effects and upbeat music (one-tap mute)
• Offer a draw, resign, or hit Play Again for a rematch

👥 TWO WAYS TO PLAY
• Online: enter a name, tap Find Match and play in real time
• Pass & Play: two players on one phone

No account needed. No ads. No tracking.
```

---

## Step 5 — Closed test with 12 testers (14 days)

1. Play Console → **Test and release → Testing → Closed testing** → **Create track** (or use "Alpha").
2. **Testers** tab → create an email list (or use a Google Group) and add **at least 12 Gmail addresses**
   (add 15–20 to be safe — testers who opt out don't count).
3. **Create new release** → upload the `.aab` from Step 2 → release name `1.0.0` → **Save → Review → Start rollout**.
4. Select **countries** (e.g. Sri Lanka + any where your testers live).
5. Copy the **opt-in link** and send it to your testers. Each tester must:
   1. open the link on their Android phone and tap **Become a tester**,
   2. install the app from the Play Store,
   3. **stay opted-in for 14 days** (and ideally play a few games — Google asks about engagement).

The 14-day clock only counts days while ≥12 testers are opted in.

---

## Step 6 — Remove the browser address bar (Digital Asset Links)

If you open the test app and see a small **URL bar at the top**, Android can't yet verify that the app
and the website belong to you. Fix:

1. Play Console → **Test and release → Setup → App integrity → App signing**.
2. Copy the **SHA-256 certificate fingerprint** under **"App signing key certificate"**
   (Google re-signs your app with this key — that's why PWABuilder's own `assetlinks.json` isn't enough).
3. Also note the SHA-256 in your `signing-key-info.txt` (your upload key).
4. **Send both fingerprints to Claude** (they are public — safe to share) and Claude will add
   `client/public/.well-known/assetlinks.json` and deploy it. It looks like:

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.shavindu.damgame",
       "sha256_cert_fingerprints": ["AA:BB:…(Play app signing key)…", "CC:DD:…(upload key)…"]
     }
   }]
   ```
5. Check it at `https://srilankan-dam-game-sandy.vercel.app/.well-known/assetlinks.json`, then
   uninstall + reinstall the app: the URL bar disappears.

---

## Step 7 — Apply for production & go live

1. After 14 days with 12+ testers, open the **Dashboard** → **Apply for production**.
2. Answer the questions about your test (what testers did, feedback, changes you made).
3. Google reviews it (usually a few days, can be longer).
4. Once approved: **Test and release → Production → Create new release** → add the same `.aab`
   (or a newer one with a higher version code) → **Start rollout to Production**.
5. 🎉 Your game is on the Play Store!

---

## Before going public — recommended

- **Upgrade Render from Free to a paid instance** (Starter). The free server sleeps after ~15 minutes, so
  the first player may wait ~50 seconds on "Finding an opponent…" — Google reviewers and new players may
  think the app is broken. Pass & Play always works instantly.
- Test on a couple of different Android phones.

## Updating the app later

| You changed… | What to do |
|---|---|
| Game code / rules / design | Just push to GitHub. Vercel deploys it; the app updates automatically. |
| App name, icon, colours, package settings | Re-run PWABuilder **with the same signing key** (upload your `signing.keystore`), increase **version code**, upload the new `.aab` in Play Console. |
