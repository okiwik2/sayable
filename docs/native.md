# Sayable as an Android and iPad/iPhone app

The apps are the same Sayable as the website, inside a real app (built with Capacitor). Compared with the website, the apps:

- never show the browser's press-and-hold menu, address bar or pull-to-refresh
- speak with the device's own voices (including Mandarin voices you download in the device settings), even with the iPhone/iPad silent switch on
- carry all pictures **and NZSL sign videos** inside, so everything works offline from the first launch
- save backups through the share sheet (Files, Drive, email, AirDrop)
- use the device's vibration on iPhone/iPad, and can keep the screen on (Settings › Display)

Words, settings and photos stay on the device, exactly like the website. The app and the website do not share data: use **Settings › Data › Back up** on one and **Restore** on the other to move everything across.

---

## Android

### Installing (for anyone)
1. On the Android phone or tablet, open the **Releases** page: https://github.com/okiwik2/sayable/releases
2. Tap the newest `Sayable-x.y.z.apk` to download it (about 190 MB, so use Wi-Fi).
3. Open the downloaded file. The first time, Android asks to allow your browser to **install unknown apps**: allow it, then go back and tap **Install**.
4. Open Sayable. When a new version comes out, the app shows "A new version of Sayable is ready" with a **Get it** button. Installing it goes over the top and keeps all words and settings.

### Making a new version (for the developer)
1. Change `"version"` in `package.json` (for example `1.0.1`) and commit.
2. `git tag v1.0.1` then `git push origin master v1.0.1`.
3. GitHub builds the signed app (Actions tab, "Android app", about 10 minutes) and puts it on the Releases page.

### The signing key: keep it safe
The key that signs the app is in `Documents\Sayable-signing` on the Windows PC (`sayable-release.jks` plus a text file with its password). A copy is stored as encrypted GitHub secrets so GitHub can build the app.
**Back this folder up somewhere safe (a USB stick or password manager).** If it is lost, new versions can't install over the old one; people would have to back up, uninstall and reinstall.

### Building on this PC (optional)
Needs Java 21 (in `%LOCALAPPDATA%\AndroidDev\jdk21`) and the Android SDK (in `%LOCALAPPDATA%\Android\Sdk`).
```
npm run assets:videos      # once: download the sign videos into the app
npm run build:native       # build the web app for the native shells and copy it in
cd android && gradlew.bat assembleDebug
```
The app is then at `android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android` opens the project in Android Studio instead, if it is installed.

---

## iPad and iPhone (on your Mac)

### One-time setup
1. Install **Xcode** from the Mac App Store (free, large download). Open it once and let it install its extra parts.
2. Install **Node.js 22 or newer** from https://nodejs.org (the LTS version).
3. In Terminal:
   ```
   git clone https://github.com/okiwik2/sayable.git
   cd sayable
   npm ci
   npm run assets:videos
   npm run ios
   ```
   This builds Sayable and opens it in Xcode.
4. In Xcode, click **App** in the left column, then **Signing & Capabilities**. Under **Team**, choose **Add an Account…** and sign in with your Apple ID, then pick your name as the team.

### Putting it on your own iPad (free)
1. Connect the iPad with a cable and unlock it. Choose the iPad at the top of the Xcode window and press the **▶ (Run)** button.
2. The first time, the iPad says the developer isn't trusted: on the iPad go to **Settings › General › VPN & Device Management**, tap your Apple ID and **Trust**. Also turn on **Settings › Privacy & Security › Developer Mode** if asked, and restart.
3. With a free Apple ID the app **stops opening after 7 days**. Connect the iPad and press ▶ again to renew it (your words and settings are kept).

### Sharing with other people: TestFlight (paid)
To give the app to others, or to stop the 7-day limit, you need the **Apple Developer Program (US$99 a year)**: https://developer.apple.com/programs/. Only sign up when you are ready; nothing else needs to change. Then:
1. In Xcode choose **Any iOS Device**, then **Product › Archive**, then **Distribute App › TestFlight & App Store** and follow the steps.
2. At https://appstoreconnect.apple.com open Sayable › **TestFlight**, add testers by email.
3. Testers install Apple's **TestFlight** app and accept the invite. Updates arrive the same way.

### After changing the code
```
git pull
npm ci
npm run ios
```
then press ▶ in Xcode.

### Mandarin voice on iPad/iPhone
**Settings › Accessibility › Spoken Content › Voices › Chinese (China mainland)**, download a voice such as Tingting (Enhanced). Sayable then uses it automatically. Avoid "Chinese (Hong Kong)": that is Cantonese.

---

## App stores (later)
Google Play (US$25 once) and the App Store (part of the US$99/year membership) also need a privacy policy (Sayable collects nothing), screenshots, descriptions and a content rating. Google Play also limits app downloads to 200 MB, so the sign videos would move to Play Asset Delivery.
