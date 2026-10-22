# Clozed MCQ

An Anki cloze note type with optional multiple choice behind each blank.

Every card starts as a normal cloze: recall first. A blank that has choices behind it is orange and glows softly. Tap it (or press Tab) and its choices appear; pick one and the blank fills in. Flip without tapping anything and the card is plain recall, exactly like Anki's own cloze.

Companion to [True-Anki-MCQ-Note-Template](https://github.com/anki-boi/True-Anki-MCQ-Note-Template).

> **Status: early.** The templates are tested in the preview harness in this repo, which copies Anki's cloze output. They have not been tested inside Anki desktop, AnkiMobile or AnkiDroid yet.

## Writing choices

Put the distractors inside the cloze, after the answer, separated by `;;`:

```
{{c1::Metformin;;Phenformin;;Buformin;;Glipizide}} is first-line for type 2 diabetes.
```

The first item is the answer. Everything after a `;;` is a distractor. Choices are shuffled on every review.

| You write | What happens |
|---|---|
| `{{c1::Metformin;;Phenformin;;Buformin}}` | Blank with three choices |
| `{{c1::Metformin;;Phenformin::biguanide}}` | Hint goes after the list and shows as `[biguanide]` |
| `{{c1::Canberra}}` | No list: a plain cloze blank |
| `{{c1::Na+;;K+}} out and {{c1::K+;;Na+}} in` | Same number twice: each blank has its own choices and its own grade |
| `{{c1::hexokinase}} ... {{c1::phosphofructokinase-1}}` | Several blanks, no lists: each blank borrows the other answers on the card |

### Nested clozes

A `;;` list belongs to the cloze whose own text it sits in. Put it at the end, after any nested cloze has closed:

```
{{c2::reduces hepatic {{c3::gluconeogenesis;;glycogenolysis;;lipolysis}};;increases insulin release;;slows gastric emptying}}
```

- Card c3 asks for `gluconeogenesis` with its own three choices.
- Card c2 asks for the whole phrase `reduces hepatic gluconeogenesis`. Its distractors are phrases too.
- Each card strips the other clozes' lists, so distractors never leak into the sentence.

### Do not use `|` as a separator

`;;` is used because the AI batch importer writes pipe-delimited rows, and a `|` inside the Text column would shift the columns.

## Grading

Only blanks you picked from are graded on the back:

- Any wrong pick: **Wrong**, with your pick struck through next to the right answer.
- Every pick right: **Correct**, even if you recalled other blanks yourself.
- Nothing picked: no verdict. Grade yourself as on any cloze card.

## Keys

| Key | Action |
|---|---|
| Tab, Right arrow, C, Q | Open the next blank's choices |
| Shift+Tab, Left arrow | Open the previous blank's choices |
| 1 to 9 | Pick a choice |
| Esc | Close the choices |

The keys are set at the top of the front template script. Anki desktop binds 1 to 4 for answering; whether those reach the card on the question side still needs testing.

## Install

1. In Anki, go to **Tools > Manage Note Types > Add**, choose **Clone: Cloze**, and name it `Clozed MCQ`.
2. Select it, click **Cards...**, and paste:
   - [`front.html`](front.html) into **Front Template**
   - [`back.html`](back.html) into **Back Template**
   - [`styling.css`](styling.css) into **Styling**
3. Keep the two fields from the Cloze type: `Text` and `Back Extra`.

## Migrating existing cloze notes

The fields match Anki's built-in Cloze type, so **Browse > select notes > Notes > Change Note Type** maps `Text` to `Text` and `Back Extra` to `Back Extra` with no changes. Cards and review history carry over because both are cloze types. Migrated notes behave as plain cloze cards until you add `;;` lists.

From other cloze note types:

| From | Map to `Text` | Map to `Back Extra` |
|---|---|---|
| Anki Cloze | Text | Back Extra |
| AnKingOverhaul | Text | Extra |
| Cloze Overlapper | Original | Remarks |
| Enhanced Cloze | the first (content) field | your notes field |

Changing note type forces a one-way sync.

## Known limits

- Type-in cloze (`{{type:cloze:Text}}`) is not supported: Anki would compare your typing against the whole `;;` list.
- `{{tts ...:cloze-only:Text}}` reads the distractors aloud.
- Places that do not run scripts show the raw `;;` text: the Browse table columns, Card Info and plain-text exports.
- Tapping a blank on AnkiMobile or AnkiDroid may also trigger the app's tap gestures. Not tested yet.
- Image Occlusion notes are not supported.

## Developing

Edit the files in `src/` and `styling.css`, then run:

```bash
python build.py
```

This writes `front.html`, `back.html` and `preview/preview.html`. Open the preview in a browser to try the templates against sample notes, switch cards, flip sides, and toggle night mode and phone width. It behaves like Anki desktop: one page, card HTML swapped in, scripts re-run.

`samples/cloze-render-samples.html` is the design exploration that led to this behaviour.

## Acknowledgements

Uses [anki-persistence](https://github.com/SimonLammer/anki-persistence) by Simon Lammer (MIT) to carry picks from the front to the back.

## License

MIT. See [LICENSE](LICENSE).
