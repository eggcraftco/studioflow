# Adding something to the chatbot

There are two assistants and they read different things. Get this right and the
rest follows.

| | Who it answers | What it reads | Where it lives |
|---|---|---|---|
| **Website assistant** | anyone on nivadesk.app, usually not signed up | `guidePublicCorpus.json` — only the "what it is for" prose | the chat widget |
| **In-app assistant** | signed-in members | `guideCorpus.json` — the whole guide | How do I…? inside the app |

Both are built from **one source**: `studioflow-web/lib/publicSite/guide.ts`.
Nothing is written twice, and nothing is edited in the JSON by hand.

## The four steps

1. **Write it in `guide.ts`, in English AND Turkish.** Same `id` in both trees —
   that is how they are paired. A chapter has `para` blocks (prose) and
   `bullets` blocks (the steps).
2. **Rebuild:** `node functions/assistant/buildGuideCorpus.js`
3. **Test:** `node functions/test/qa/guide-corpus-fresh.test.js && node functions/test/qa/guide-platform-tags.test.js && node functions/test/qa/guide-retrieval.test.js`
4. **Deploy by name:**
   `npx firebase deploy --only functions:askAppAssistant,functions:getUserGuide,functions:createWebsiteChat,functions:postWebsiteChatMessage`

Then ask the live bot the question a customer would ask. Not a question you
wrote the answer to — the one they would type.

## What goes in a `para`, what goes in a `bullets`

This is the whole public/member split, so it is not a style choice.

- **`para` — what the feature is for.** Public. A visitor with no workspace sees
  this, and it is all they see.
- **`bullets` — how to work it.** Members only. Menu paths, button names, field
  names, order of operations.

Write a chapter whose steps live in a `para` and you have just published the
operating manual to the marketing site. `guide-corpus-fresh.test.js` fails if
the public corpus ever grows past half the full one, which is the alarm for
exactly that.

## Say WHERE, not just what

The member assistant is asked *where*. A chapter that only explains a feature's
purpose reads beautifully and answers nothing — and the model will invent a
menu path rather than admit it has none. It has done exactly that.

So read the real labels off the screen and write them:

> Inventory ▸ Stocktake. **Start a count** opens one; each item then has a
> **Count** box for what you actually found.

Not "go to inventory and follow the on-screen instructions".

## When the apps genuinely differ

Sections are reached differently on a phone than in a browser. Tag only the
lines that differ:

    "[Web] The sections run along the top of the window.",
    "[iPhone/iPad] The sections live behind the menu button in the top bar.",
    "An untagged line is true on all four apps."

Known tags — and the test fails on any other — are `[Web]`, `[Mac]`,
`[iPhone/iPad]`, `[Android]`. Each client tells the server which app it is, and
the assistant is shown only its own tag plus the untagged lines.

**Prefer untagged.** Past the first `▸` the four apps use the same tab and
button names, so most steps need no tag at all. `Finding your way around, on
each app` is the one chapter that explains the difference; everything else
writes `Section ▸ Tab ▸ Button` and lets that chapter do the work.

## The other ten languages

`guide.ts` holds English and Turkish. The other ten come from
`studioflow-web/lib/publicSite/guideTranslations.ts`, which maps an English
string to its translation; anything with no entry falls back to English. A new
chapter is therefore **live but English-only** in those ten until it is added
there. That is a deliberate fallback, not a failure — the page still renders —
but it is not finished until the strings are in.

The bot is different: it answers in whatever language it is asked, because it
translates as it writes. Only the guide *document* needs the dictionary.

## Two things that are easy to get wrong

- **The bot reads the JSON, not `guide.ts`.** Skip step 2 and it keeps
  answering from the old text, confidently, with no sign anything is wrong.
  `guide-corpus-fresh.test.js` is the guard.
- **The retrieval is keyword-based.** A chapter is found by the words a person
  would actually type, and titles and sub-headings score highest. If the button
  is called "Start a count", put that phrase in a heading — not a description of
  it.
