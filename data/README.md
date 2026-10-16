# Vocabulary files

Everything Sayable knows — words, phrases, topics, boards and next-word suggestions — lives in
plain text files in this folder. They can be edited in any text editor (or a spreadsheet, using `|`
as the separator) and translated without touching the app's code.

After editing, run:

```
npm run data:validate   # check for mistakes (duplicate ids, unknown topics, broken links)
npm run data            # rebuild the app's vocabulary
npm run assets:symbols  # look up ARASAAC pictures for new words (needs internet)
npm run assets:nzsl     # link new words to NZSL signs (needs internet)
```

## `vocab/*.txt` — words and phrases

```
@ topic-id
English | Chinese | kind of word | options
```

- **English / Chinese**: the first entry is what the tile shows and says. Extra entries after `;`
  are other ways to say it and are found by search. Use `-` when a word does not exist in that
  language (for example English `the`, or the Chinese particle `了`).
- **Kind of word**: `noun verb adj adv pron det prep conj interj num q particle measure phrase`.
  This drives the colour coding and the grammar suggestions.
- **Options** (space separated; use `_` for spaces inside a value):

| option | meaning |
| --- | --- |
| `id=xxx` | Stable id. Default: made from the English word, or `zh-` + pinyin for Chinese-only words. Ids are what boards, favourites and backups point to, so don't change them once in use. |
| `cat=a,b` | Also show in these topics. |
| `kw=a,b` | Extra search words. |
| `gloss=...` | English meaning for Chinese-only words. |
| `py=...` | Pinyin with tone marks when the automatic pinyin is wrong (e.g. `py=le` for 了). |
| `say=...` | How to pronounce the English if the label is different (e.g. `cool!` → `say=cool`). |
| `sym=1234` / `sym=none` | Pin an ARASAAC pictogram number, or no picture. Find numbers at arasaac.org. `node scripts/set-symbol.mjs word-id=1234` does this for you. |
| `symq=word` | Search ARASAAC with this word instead. |
| `past= pp= ing= s= pl=` | Irregular English forms (`went`, `gone`, `running`, `does`, `children`). |
| `unc` | Uncountable noun (no "a"/"an": water, rice). |
| `modal` | Helper verb (can, will) — no "to" after it. |
| `person=1/2/3` | For pronouns. |
| `essential` | Refusal and safety words. They can never be hidden or deleted by anyone. |

Traditional characters and pinyin (with tone marks, tone numbers and plain) are generated
automatically from the Simplified Chinese.

## `categories.txt` — topics

`id | parent | English name | Chinese name | colour | ARASAAC search word or number`

## `boards.txt` — boards

Core boards are written row by row, one per language and size (starter 6×6, standard 8×8,
extended 10×10). Mandarin has its own core boards because its core words and word order differ
from English. Place boards (home, school, doctor…) work in either language.

## `quick-phrases.txt` — quick phrases

Groups of ready-made messages that are spoken straight away. The `pinned` group is the strip of
quick replies along the top of the screen (Yes, No, Stop, Help…).

## `predict.txt` — starter suggestions

`word-id: next-word-id, next-word-id+form`, per language. `want+s` means "wants". The app also
learns from what each person says (on their device only, and only if they allow it).

## `symbols/` and `signs/`

Generated lookup tables (ARASAAC pictogram numbers and NZSL sign links). Re-create them with the
`assets:` scripts above; you can still pin individual pictures with `sym=`.
