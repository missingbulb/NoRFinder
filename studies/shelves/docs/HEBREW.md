# Reading Hebrew on spines — the problems and their classic fixes

Research notes for the readers' Hebrew (2026-11-10), narrowed, on the owner's word, to what a spine carries: a
title, an author's name and a publisher, not any Hebrew text. Each item says what the problem is, the fix the
literature or the field uses, and what it did here, measured on the two tagged photos (`1HyJrL`, `1g4iFN`) as words
read whole; CER moved by 0.002 at most unless said. **Two photos, nothing held out: every number is indicative**, and the
cut-offs below were chosen on those same photos.

## The spine as a language

- A spine's text is short and has a shape: `author / title`, with the publisher (or its series) at the foot. 11 of
  the 32 tagged books carry the slash. The words are three kinds: author names (mostly foreign names in Hebrew
  letters on these shelves: `פרנק הרברט`, `רוברט היינליין`), title words (ordinary Hebrew, plus coined words such
  as `חולית`) and publisher names (`מעריב`, `זמורה ביתן`). A general word list covers the title words; it misses
  the names, which are the larger share of what the readers get wrong.
- Of the tagged books' 170 Hebrew words, 36 are not on the subtitle word list (`web/words/heb.txt`); 32 of those are
  words of Hebrew Wikipedia's article titles. The four left: a rare inflection (`המוליכה`), two names (`גאלויה`,
  `קיריליאני`), and one slip in the tagged text itself (`המכשוף`).

## The problems and the fixes

1. **Letters print makes look alike** (ב/כ/נ, ד/ר/ך, ה/ח/ת, ו/ז/ן/י, ס/ם/ט, ג/נ, ע/צ). The classic fix is a
   dictionary lookup over a confusion set, the candidate ranked by frequency; a published study of historical Hebrew
   OCR adds that a fixed substitution table alone is not enough, which is why the candidate must be a listed word.
   **Here (R7, kept):** one look-alike letter away from a listed word. Any one-letter edit instead turned names into
   wrong words (`קריספין` → `קריסטין`).
2. **Prefix letters fused to the word** (ו ה ב כ ל מ ש, "משה וכלב"): `והחתול` is ו + ה + חתול, and no list holds
   every prefixed form. The classic fix, as HebMorph's analyzer does, strips prefixes one at a time and looks up
   what is left. **Here (R7, kept):** one or two prefix letters taken off before the lookup.
3. **Final letters** (ך ם ן ף ץ) are written only at a word's end. A final letter inside a run of letters is
   therefore a space the reader missed. Deterministic, no dictionary needed. **Here (kept):** a run splits after an
   inner final letter (`דרךקירות` → `דרך קירות`). Measured with 4 below, as the page reads. The converse, forcing a regular form at a word's end into its final form,
   lowered CER slightly on three of four and was dropped.
4. **Full and defective spelling** (כתיב מלא / חסר): one word is written with or without its ו and י
   (`היינליין` / `היינלין`), and names, which the spelling rules do not govern, vary most. The Library of Congress's
   advice for Hebrew catalog searches is to look for both spellings. **Here (kept):** a ו or a י added or dropped
   counts as one word. With 3, on the page's own path (`read.mjs`), words `tesseract` / `lines`: `1HyJrL`
   0.38 → 0.40 / 0.23 → 0.30, `1g4iFN` 0.19 → 0.20 / 0.08 unchanged.
5. **Words run together** (a missed space with no final letter to show it): the classic fix is dictionary word
   segmentation, the most probable split under word frequencies (a unigram Viterbi pass); a study of historical OCR
   correction finds segmentation errors among the commonest. **Here (not yet):** with the subtitle list alone it
   splits names into nonsense (`קריספין` → `קריס פין`, `וונגרין` → `וונג רין`): `lines` on `1g4iFN` 0.07 → 0.12,
   but `tesseract` there 0.19 → 0.17. **With the names list (below), kept:** runs are parted into listed words of 3
   letters or more (`SPLIT`).
6. **Direction marks in the output**: Tesseract puts U+200E and U+200F around runs it reads as the other direction.
   They are invisible, but they part a word in two for anything matching words. To be stripped before the lookup
   (the speller already sees only Hebrew letters).
7. **Geresh** (`ג'`, `צ'`, `ז'` for sounds Hebrew lacks, frequent in foreign names: `ג'ון`, `ג'קסון`): read as `'`,
   `׳`, `,` or dropped. Not yet handled; the names lexicon carries the spellings with it.
8. **A reading at the wrong turn** comes out as short common words (`שש`, `זו`, `Le`). So a dictionary is no judge of
   the turn: choosing it by the share of known words lost (CER 0.39 → 0.72). The reader's own confidence stays the
   judge.

## Where the words can come from

| Source | Holds | At run time | Licence |
|---|---|---|---|
| FrequencyWords `he_50k` (OpenSubtitles 2018), the list now served | ordinary words, by frequency | yes: jsDelivr serves the GitHub file at a pinned commit, CORS open, 790 KB | CC BY-SA 4.0 |
| hspell as Hunspell (`dictionary-he` 2.0.0 on npm) | every inflection, prefixes by affix rules | yes, through jsDelivr, but needs a Hunspell engine in JS (nspell) | **AGPL-3.0** |
| Hebrew Wikipedia's article titles (`hewiki-<date>-all-titles-in-ns0.gz`, dated dumps) | author names, book titles, publishers | **no**: dumps.wikimedia.org sends no CORS header; the lab would build it into a site file. Titles in 3 or more articles: 38,538 words beyond the subtitle list, 157 KB gzipped | CC BY-SA |
| Wikidata, Hebrew labels of writers | author names | no bulk file; queries over all writers time out server-side | CC0 |
| National Library of Israel's authority file | authors' Hebrew names, authoritative | no bulk download found | — |

**Chosen (the owner, 2026-11-10):** the subtitle list from jsDelivr at a pinned commit, kept offline with the
study's Python; then the words of Hebrew Wikipedia's titles in at least 3 articles that it lacks (38,538, 490 KB),
which the lab writes from the 2026-11-01 dump (`lab/words.py`, pinned by SHA-256) and the site serves. All of it on
the page's own path, words read whole, `tesseract` / `lines`:

| | the look-alike speller alone | + final letters, ו/י | + names list, runs parted |
|---|---|---|---|
| `1HyJrL` | 0.38 / 0.23 | 0.40 / 0.30 | 0.48 / 0.35 |
| `1g4iFN` | 0.19 / 0.08 | 0.20 / 0.08 | 0.23 / 0.15 |

CER on the last column: 0.384 / 0.361 and 0.682 / 0.785, none worse than the first.

## Gaps

- No English title is tagged, so nothing here touches English.
- A domain lexicon of authors and publishers as such (rather than every Wikipedia title) was not found as a
  download; the National Library's would be the authoritative one.

## Sources

- Neural OCR post-hoc correction of historical corpora (TACL 2021): aclanthology.org/2021.tacl-1.29
- Toward a period-specific optimized neural network for OCR error correction of historical Hebrew texts (ACM JOCCH,
  2022): doi.org/10.1145/3479159
- HebMorph, open-source Hebrew analysis: code972.com/blog/2010/06/open-source-hebrew-information-retrieval-hebmorph-part-3-20
- Hebrew spelling, ktiv male and haser: en.wikipedia.org/wiki/Hebrew_spelling
- Library of Congress, Hebrew Unicode catalog searching (both spellings)
- Tesseract and Hebrew direction: groups.google.com/g/tesseract-dev/c/zVPeZ5FeLeE
