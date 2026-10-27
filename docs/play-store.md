# Publishing Sayable on Google Play

The Play build is the normal Android app with two differences (set by `VITE_STORE=play`):

- **No sign videos inside.** Play limits downloads to 200 MB and the videos are 168 MB. Each video
  plays from the NZSL dictionary the first time and is saved on the device; Settings › Signs can
  save them all at once (`src/services/sign-videos.ts`).
- **No "new version" prompt.** Play updates the app itself, and its rules don't allow offering
  downloads from elsewhere.

The APK on GitHub Releases keeps the videos and the update prompt.

## 1. Build the bundle

Play takes an Android App Bundle (`.aab`), not an APK.

1. Raise the version in `package.json` (`npm version patch`). Play refuses a version code it has
   seen before; the code comes from the version (1.0.1 → 10001).
2. Push the tag: `git push origin master --follow-tags`. The **Android app** workflow builds both the
   APK and `Sayable-<version>-play.aab`.
3. Download the `Sayable-android` artifact from the workflow run (Actions tab) and unzip it.

## 2. First-time setup in Play Console

1. **Create app**: name *Sayable*, default language English (United Kingdom or New Zealand),
   App, Free.
2. **App signing**: accept *Play App Signing*. The key in the repository secrets becomes the
   **upload key**. Keep a backup of `sayable.jks` and its passwords somewhere safe.
3. **App content** (Policy › App content):

   | Form | Answer |
   |---|---|
   | Privacy policy | `https://okiwik2.github.io/sayable/privacy.html` |
   | Ads | No ads |
   | App access | All functionality is available without special access |
   | Content rating | Questionnaire: category *Reference, News, or Educational* (or *Communication*); answer No to everything. Expect *Everyone / 3+*. |
   | Target audience | Include under-13 groups if children will use it. This applies the Families policy, which Sayable meets: no ads, no data collection. |
   | Data safety | See below |
   | Government apps / Financial features / News | No |
   | Health apps | Sayable is a communication aid, not a medical device. Choose the closest option, or "no health features" if none fits. |

   **Data safety** answers:
   - Does the app collect or share user data? **Yes**, only because symbol search sends the search
     words to ARASAAC. Declare *App activity › In-app search history* (or *Other user-generated
     content*): collected, **not shared**, **processed ephemerally**, **optional**, purpose
     *App functionality*.
   - Everything else (words, photos, contacts, location) stays on the device and is **not collected**.
     Location is only shown on screen.
   - Data is encrypted in transit: **Yes** (HTTPS).
   - Users can request deletion: everything is on the device; clearing the app's data deletes it.

4. **Store listing** (Grow › Store presence › Main store listing): text below, plus
   - App icon 512×512: `public/icons/icon-512.png`
   - Feature graphic 1024×500
   - At least 2 phone screenshots, and 7-inch and 10-inch tablet screenshots
     (`node scripts/screenshot-devices.mjs` makes device screenshots)
   - Category: *Communication* (or *Education*); contact email; website `https://okiwik2.github.io/sayable/`

## 3. Closed test (personal accounts)

A new personal developer account must run a closed test with **at least 12 testers who stay
opted in for 14 days in a row** before it can publish to everyone.

1. Testing › Closed testing › create a track. Add testers by email list (or a Google Group).
2. Create a release, upload the `.aab`, roll it out.
3. Send testers the opt-in link from the track page. They must opt in with the Google account
   they use for Play, then install Sayable from Play. Ask them to open it now and then.
4. After 14 days, Dashboard › **Apply for production**. Google asks how testing went: say who
   tested (families, carers, therapists), what you learned, and what you changed.
5. Once approved, create a Production release with the same (or newer) `.aab`. Review usually
   takes a few days.

## Store listing text

**App name:** Sayable

**Short description (80 characters max):**
> Talk with words, symbols and sign. English and Mandarin. Free, works offline.

**Full description:**

> Sayable is a free communication app (AAC) for people who find speaking hard. Tap pictures to build a message, and Sayable says it out loud.
>
> • Core word boards in three sizes, plus topics, places and quick phrases
> • English and Mandarin Chinese, with pinyin and simplified or traditional characters
> • Grammar help: Sayable changes words to fit the sentence
> • NZ Sign Language videos and drawings for many words
> • Add your own words and photos, and make your own boards
> • Optional safety features: an emergency message, contacts and your location on screen
> • Works without internet. No account, no ads, no tracking: everything stays on your device
>
> Symbols: Sergio Palao, ARASAAC (arasaac.org), Government of Aragón, CC BY-NC-SA 4.0.
> Signs: NZSL Online (nzsl.nz), Deaf Studies Research Unit, Victoria University of Wellington, CC BY-NC-SA 4.0.
> Sayable is free and non-commercial, as these licences require.

Check the bullet points against the current app before publishing.
