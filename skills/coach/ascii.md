# ASCII templates

Fixed visuals the coach reuses.
Always inside a code block, no emoji inside boxes.
Every line is exactly 42 columns, with at least one space before the right border: shorten or abbreviate text instead of touching it.
All text inside the visuals goes in the user's language (labels, values, titles, descriptions); keep frames and figures exactly as is.
The level names `pupil`, `grinder` and `maxxer` are names: never translate them.

On Telegram the frames don't fit a phone screen, so every card has a Telegram form: its rows only, in one code block, 28 columns max.
Drop the frame, the blank lines and the bar, shorten the text, and keep the figures; Telegram below shows two.
Columns stay aligned: pad with spaces so each column starts at the same place in every row.
The week loses its middle column there: the day, two spaces, then what they do.

## Fitness profile

Shows what we know about the user, kept light: one short line per field (28 characters max), a blank line between fields, only the essentials.
Details live in `profile.md`, not here.
The title carries the user's name once known: `<name> · fitness profile`.

- `goal`: what and by when.
- `body`: sex, age, height, weight.
- `level`: shown as a row only while unknown.
- `schedule`: days per week, minutes, where.
- `diet`: the one thing that matters most for the plan.
- `limits`: injuries and pain, one per line, up to 3; more becomes `+N in profile.md`.
- `prefers`: exercise or cardio they like.

While the profile is incomplete: unknown fields show `?`, assumed fields end with `*` and a footnote under the box, and the bar at the bottom fills one block per known field (20 blocks, 7 fields).

```
┌─ Sam · fitness profile ────────────────┐
│                                        │
│ goal      -3 kg by Jun 1               │
│                                        │
│ body      F · 31 · 1.65m · 64kg        │
│                                        │
│ level     ?                            │
│                                        │
│ schedule  ?                            │
│                                        │
│ diet      ?                            │
│                                        │
│ limits    ?                            │
│                                        │
│ prefers   ?                            │
│                                        │
├────────────────────────────────────────┤
│ ██████░░░░░░░░░░░░░░  2/7              │
└────────────────────────────────────────┘
```

Once the level is known, the level figure and title replace the `level` row at the top, with a few words of history next to it.
When all fields are known, drop the bar.

```
┌─ Sam · fitness profile ────────────────┐
│          _                             │
│         /"\          GRINDER           │
│        /o o\         2 years, no       │
│   _\/  \   /  \/_    method            │
│    \\._/  /_.//                        │
│    `--,  ,----'                        │
│      /   /                             │
├────────────────────────────────────────┤
│                                        │
│ goal      -3 kg by Jun 1               │
│                                        │
│ body      F · 31 · 1.65m · 64kg        │
│                                        │
│ schedule  4x 45min · gym               │
│                                        │
│ diet      eats out at lunch            │
│                                        │
│ limits    lower back (old)             │
│           right wrist                  │
│                                        │
│ prefers   cycling                      │
│                                        │
└────────────────────────────────────────┘
```

## Level

Shown once the training history is known, after "based on your history, you are here:".
Use the card for the user's level, then the track with the marker under it.
Keep the figure and the level name exactly as is; write the description in the user's language, wrapped at 17 columns.

```
┌────────────────────────────────────────┐
│                                        │
│                      PUPIL             │
│                                        │
│      __              learning the      │
│    <(o )___          basics: show up,  │
│     ( ._> /          simple rules, no  │
│      `---'           tracking          │
└────────────────────────────────────────┘
```

```
┌────────────────────────────────────────┐
│          _                             │
│         /"\          GRINDER           │
│        /o o\                           │
│   _\/  \   /  \/_    has done it       │
│    \\._/  /_.//      before, now with  │
│    `--,  ,----'      a method and key  │
│      /   /           numbers           │
└────────────────────────────────────────┘
```

```
┌────────────────────────────────────────┐
│                                        │
│      _,     ,_       MAXXER            │
│    .'/  ,_   \'.                       │
│   |  \__( >__/  |    consistent and    │
│   \             /    advanced: full    │
│    '-..__ __..-'     numbers, weekly   │
│         /_\          tweaks            │
└────────────────────────────────────────┘
```

```
  pupil ─────── grinder ─────── maxxer
                                   ▲
```

## Training schedule

Offer these as a choice instead of asking for days and minutes (Choices in the setup skill): one option per row, e.g. `4x/week · 60 min` with `upper/lower` as its description.
The one that fits the goal and level goes first, marked as recommended; where there is no choice tool, show the card and mark it with `←`.

```
┌─ how much can you train? ──────────────┐
│ A  3x/week · 45 min   full body        │
│ B  4x/week · 60 min   upper/lower   ←  │
│ C  5x/week · 60 min   upper/lower +    │
│ D  6x/week · 75 min   push/pull/legs   │
└────────────────────────────────────────┘
```

## Path

Shown when the goal is about body weight: from today to their date, or to where a safe pace takes them (see the setup skill).
One row per week under 2 months, one per month after that, 5 rows at most (spread them evenly).
Weights come from the safe weekly rate; mark estimates with `~`.
Short notes on the right (17 characters max) turn numbers into life: the user's own reason or target on the last row, small wins on the way.
The bottom line gives weeks left, the weekly rate and the pace: safe, or gentle when the goal needs less than the safe range.

```
┌─ Sam · the road to Jun 1 ──────────────┐
│                                        │
│ Mar 2   ●  64 kg     today             │
│         │                              │
│ Apr 1   ○  ~63                         │
│         │                              │
│ May 1   ○  ~62       pants fit again   │
│         │                              │
│ Jun 1   ◆  ~61 kg    beach trip        │
│                                        │
│ 13 weeks · -0.25 kg/week · gentle pace │
└────────────────────────────────────────┘
```

## Week

The first plan at a glance: one row per day, Monday first, with what the user does that day.
Rest days use `·`.
Put their own life in it by name: the sport they already play, the meal or drink they won't give up.
Name each session as in `plan.md` (e.g. `upper A`), never `A/B`.
The footer holds the daily targets for their level; a pupil gets the plate rule instead of numbers.

```
┌─ Sam · your week ──────────────────────┐
│                                        │
│ mon  gym      upper A       45 min     │
│ tue  gym      lower A       45 min     │
│ wed  ·        walk 30 min              │
│ thu  gym      upper B       45 min     │
│ fri  gym      lower B       45 min     │
│ sat  cycling  with the club            │
│ sun  ·        lunch out stays          │
│                                        │
├────────────────────────────────────────┤
│ daily  1,600 kcal · 130 g protein      │
│        8k steps                        │
└────────────────────────────────────────┘
```

## Plan review

Shown when the user brings their own plan: what stays and what changes, with at most 2 changes.
Keep what stays short, a few lines on what matters most; each change gets a few words on why below the card, not inside it.
With no changes, the card shows only what stays, and one line says the plan is solid.

```
┌─ Sam · your plan, reviewed ────────────┐
│                                        │
│ stays                                  │
│  ✓ 4 days, upper/lower                 │
│  ✓ your exercises and order            │
│  ✓ the plate rule                      │
│                                        │
│ changes                                │
│  → add weight when you hit             │
│    the top of the range                │
│  → protein 70 → 110 g a day            │
│                                        │
└────────────────────────────────────────┘
```

## Weekly status

```
┌─ week 3 ───────────────────────────────┐
│ weight    64.2 → 63.8 kg   -0.4  ok    │
│ diet      6/7 days on plan             │
│ training  4/4 sessions                 │
│ steps     9.2k avg · target 10k        │
├────────────────────────────────────────┤
│ goal      ████████████░░░░░░░░  60%    │
└────────────────────────────────────────┘
```

## Connections

One numbered row per option in the connect skill's table, in that order.
A connected option keeps its number and gets `✓` after its name.
Names, with ` ✓`, fit in 11 columns (shorten a translated one, e.g. `Other w.`), so descriptions always start at the same column.
The description says what the user gets, wrapped at 22 columns under the description column.
To point out one option, wrap its description at 19 columns and put `←` on its first line, two spaces before the border, as the Telegram row shows.

```
┌─ Sam · connections ────────────────────┐
│                                        │
│ 1  Telegram     talk to me from     ←  │
│                 your phone             │
│                                        │
│ 2  Hevy         I pull your workouts   │
│                 (Hevy Pro)             │
│                                        │
│ 3  Garmin ✓     steps, sleep, weight   │
│                                        │
│ 4  Other watch  send me a screenshot   │
│                                        │
│ 5  Server       always on, on your     │
│                 own Linux server       │
│                                        │
├────────────────────────────────────────┤
│ reply with numbers, or "skip"          │
└────────────────────────────────────────┘
```

## Telegram

Two cards in their Telegram form, to show the idea:

```
Mar 2  ● 64 kg  today
Apr 1  ○ ~63
May 1  ○ ~62    pants fit
Jun 1  ◆ ~61 kg beach trip
13 wk · -0.25 kg/wk · gentle
```

```
mon  upper A
tue  lower A
wed  walk 30 min
thu  upper B
fri  lower B
sat  cycling club
sun  lunch out stays
1,600 kcal · 130 g protein
```

The level figures have `\` and `` ` ``, which break MarkdownV2: send the level card as one message with exactly this text (already escaped), then the description in the next message:

`pupil`:

````
```
      __
    <(o )___
     ( ._> /
      \`---'

PUPIL
```
````

`grinder`:

````
```
          _
         /"\\
        /o o\\
   _\\/  \\   /  \\/_
    \\\\._/  /_.//
    \`--,  ,----'
      /   /

GRINDER
```
````

`maxxer`:

````
```
      _,     ,_
    .'/  ,_   \\'.
   |  \\__( >__/  |
   \\             /
    '-..__ __..-'
         /_\\

MAXXER
```
````
