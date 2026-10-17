# Sayable

An AAC (augmentative and alternative communication) app for people who are non-speaking,
minimally speaking, or need another way to talk. Build a message from words and pictures, then
say it out loud with a voice you choose — in English, Mandarin, or both. It installs from the
browser onto a tablet, phone, Chromebook or computer and works without the internet.

## What it does

- **Core words first.** A fixed, colour-coded core board (36, 64 or 100 words) where every word
  stays in the same place, plus 1,598 words and phrases in 46 topics.
- **Builds real sentences.** Tap words into the message bar, then Speak. Tap any word in the message
  to move it, replace it, change its form (want → wants / wanted / wanting) or remove it, or to
  add words before it. Undo, delete-last-word and clear (with undo) are always visible.
- **Quick replies** (Yes, No, Stop, Help, I need a break, Please wait) are always on screen and
  speak straight away without disturbing the message being built.
- **Suggestions, never surprises.** Next-word suggestions and "suggested wording"
  (“me want go shop” → “I want to go to the shop.”) are clearly marked, can be turned off, and
  never change the message unless chosen. They run on the device; nothing is sent anywhere.
- **English and Mandarin.** Separate interface language and talking language. Mandarin has its
  own core board and grammar rules, Simplified or Traditional characters, pinyin on tiles, and
  search by characters, pinyin or tone numbers (`xi3huan`). Mixed messages are spoken with a voice
  for each language; Chinese is never read out with an English voice, and Cantonese voices are
  never used for Mandarin.
- **ARASAAC symbols** for 1,105 words (stored in the app, so they work offline), your own photos
  (camera or file, with cropping), or text only.
- **NZSL.** 1,105 words are linked to New Zealand Sign Language videos and drawings from the
  official NZSL dictionary, with replay, slow motion and repeat. Matches are made by English word
  and labelled as such until someone confirms them; you can choose another sign or add your own.
- **Access.** Tap, touch-to-choose or hold-to-choose; ignore accidental repeat taps; one- or
  two-switch scanning; dwell selection for head pointers and eye gaze; full keyboard use; screen
  reader labels; light, dark and two high-contrast themes; a colour-blind-friendly palette;
  adjustable text and button size; a simple view; reduced motion.
- **Personal.** Several profiles, each with its own words, pictures, voice and settings. Add and
  edit words, hide words, rearrange boards, make your own boards, keep earlier versions of boards,
  and lock editing with a PIN. Every change is listed in a change history, and essential words
  (No, Stop, Help, I don't like that…) can never be hidden by anyone.
- **Safety.** An emergency message shown full-screen, "about me" and medical details, and trusted
  contacts. Nothing is ever called or sent automatically.
- **Private and reliable.** Everything is stored on the device. No account, ads or tracking.
  Backups export to a file; imports are checked first and a restore point is saved before anything
  changes. An unfinished message comes back if the app is closed by accident.

## Running it

You need [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm run assets:nzsl   # once: downloads NZSL sign videos and drawings (about 185 MB)
npm run dev           # open the address it prints, e.g. http://localhost:5173
```

To build the version people install:

```
npm run build         # checks the vocabulary, type-checks and builds into dist/
npm run preview       # try the built version at http://localhost:4173
```

To install it on a tablet or phone, the `dist/` folder has to be served over **https** (browsers
only allow installing and offline use from secure sites). Any static web host works, for example
GitHub Pages, Netlify or Cloudflare Pages. Then open the address on the tablet and choose
**Add to Home Screen** (iPad/iPhone, Safari) or **Install app** (Android/Chrome/Edge). After the
first visit it works offline.

**Voices come from the device.** For Mandarin, the device needs a Mandarin voice:
Windows: Settings › Time & language › Speech › Add voices. iPad/iPhone: Settings › Accessibility ›
Spoken Content › Voices. Android: Settings › System › Languages › Text-to-speech.

## Android and iPad/iPhone apps

The same app also comes as native Android and iOS apps (Capacitor): no browser press-and-hold menu, the device's own voices, and everything (including NZSL sign videos) inside the app. How to install, build and share them: [docs/native.md](docs/native.md).

```
npm run build:native   # build for the apps and copy into android/ and ios/
npm run android        # open in Android Studio
npm run ios            # open in Xcode (on a Mac)
```

## Tests

```
npm test              # unit tests (sentence building, grammar, search, speech, backups, data checks)
npm run test:e2e      # end-to-end tests in Microsoft Edge, tablet and phone sizes
npm run data:validate # check the vocabulary files
```

The end-to-end tests replace the speech engine with a recorder, so they check exactly what would
be said and in which voice. They include working offline, Mandarin and bilingual speech, switch
scanning, dwell, and automated accessibility checks (axe). Automated checks are not a substitute
for testing with real assistive technology and real users.

## Changing the words

See [data/README.md](data/README.md). The vocabulary is plain text, one word per line.

## Project layout

```
data/            vocabulary, topics, boards, quick phrases, suggestions (plain text)
scripts/         build the vocabulary, fetch symbols and signs, make icons
src/domain/      sentence building, formatting, grammar, suggestions, search, settings (no UI)
src/services/    speech engine, on-device database, backups, pictures
src/state/       app state and actions
src/ui/          screens and components; styles.css holds the design system
tests/unit/      unit tests (Vitest)
tests/e2e/       end-to-end tests (Playwright, Edge)
```

## Credits and licences

- **Pictographic symbols:** Sergio Palao. Origin: [ARASAAC](https://arasaac.org). Licence:
  CC BY-NC-SA 4.0. Owner: Government of Aragón (Spain).
- **NZSL signs, videos and drawings:** [NZSL Online](https://www.nzsl.nz), Deaf Studies Research
  Unit, Victoria University of Wellington. Licence: CC BY-NC-SA 4.0. Data from the
  [NZSL dictionary data releases](https://github.com/ODNZSL/nzsl-dictionary-scripts).

Because of these licences, Sayable with these symbols and signs may only be used and shared
**non-commercially**, with credit, under the same licence.

## Limitations — please read

- The starter vocabulary follows common AAC practice (core words, stable positions, word-type
  colours) but **has not been clinically validated**. A speech-language therapist should review
  it for each person.
- The **Mandarin** vocabulary, pinyin corrections and Chinese interface text should be reviewed by
  a native speaker.
- **NZSL** signs are matched to words automatically by English meaning. Some words have several
  meanings, so check each sign (and mark it "right") before relying on it.
- Voice quality and languages depend on the device. Personal/cloned voices are not included.
- ASL and BSL have no sign content yet; the app supports adding your own video or link per word.
