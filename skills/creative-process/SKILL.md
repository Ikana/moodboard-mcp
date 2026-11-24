---
name: creative-process
description: Run the owner's creative process from a loose idea to finished artifacts in four fixed stages (freeform, three keyword columns, seeded randomness, artifacts). Use when the person says "start a new creative project", "run my creative process", "I have an idea", "help me find my columns", or wants to go from an idea to moodboards and directions.
---

# Creative process

This is the person's own process, and it is still a draft. Run the four stages in order, and show the person the result of each stage before moving on. They often redirect at a stage, and their word wins over this file.

1. **Freeform**: get the idea out, loosely.
2. **Three columns**: distil the freeform into three columns of three keywords.
3. **Seed randomness**: use the columns and random seeds to explore wide.
4. **Artifacts**: turn what the seeds opened into moodboards, directions and mockups.

The process is a spiral, not a line. It starts from the person's intent at the base and climbs, tightening as it goes. If a later stage shows the idea has changed, go back a stage and say so. Don't redesign the spiral figure itself. If it appears in an artifact, use the person's existing spiral as is.

## 1. Freeform

The person's own intent always comes first. Don't suggest ideas before they have given theirs.

Ask for the idea in their own words, and let them dump anything around it: notes, words, references, images, links, files, half-sentences. Don't organise yet. If they get stuck, these questions help (from their worksheet):

- What do I want to make, and why now?
- Who is it for, and what should they feel?
- What would make it unmistakably mine?

Ask one or two follow-ups at most, then reflect back what you heard in a few lines: the intent, the feelings, the recurring words, and the references they named. Stop when they say it's right.

## 2. Three columns

Distil the freeform into **three columns of three keywords**, nine keywords in all:

- Each keyword is one to three words and comes from the person's own language where possible. ("Engineering inspired", "Awe", "Blues & red/orange".)
- Each column is one facet of the idea, so the three columns pull in different directions. A useful default is what it is about, how it looks, and how it should feel. Give each column a short name.
- Number the nine keywords 1 to 9 by priority across all columns, with 1 the most important. Every column needs at least one keyword from 1 to 3.

Show it as a table and ask the person to swap, rename or reorder. Use all nine keywords in the later stages. Don't drop the low-priority ones; give them less weight.

| Column A | Column B | Column C |
|---|---|---|
| 6 Engineering inspired | 5 Clear typography | 4 Simple OR complex |
| 3 Inspiring | 7 Harmonious colours | 8 Blues & red/orange |
| 9 Rich | 2 Awe | 1 Flow |

*(The person's first set, for reference.)*

Save the agreed columns to `columns.md` in the project folder, with the date and the intent sentence from stage 1.

## 3. Seed randomness, explore wide

The model's own "random" choices land on the same few patterns, so bring the randomness in from outside. Then go as wide as possible before narrowing.

For each column:

1. Roll a seed in the shell: `head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40`.
2. Read the seed for structure: repeated characters, digit shapes (6 and 9 → a loop or figure-eight; 8, Q, O → openings; X, 1 → a single axis), counts and rhythms. Pick one reading that fits the column's keywords, and write it down in one sentence ("X1 gave the single axis, 4Ez4X the exploded view").
3. Let the seed also pick the wild card: use its characters to choose one unexpected domain, material or artist the person didn't mention, and add it to that column's search list.
4. Explore wide with the `moodboard` MCP: 4–6 `find_images` searches per column, built from specific things the keywords suggest (artists, techniques, phenomena), never the bare keywords. Follow the board-building steps in [../creative-direction-boards/SKILL.md](../creative-direction-boards/SKILL.md), stage 1.

Report per column: the seed, its reading, the wild card, the board path, and which images surprised you. Ask the person which threads they want to follow. That is the narrowing point.

## 4. Artifacts

Turn the chosen threads into artifacts with the [creative-direction-boards](../creative-direction-boards/SKILL.md) skill, stages 2 and 3: one direction per column, using that column's seed from stage 3, the critic loop, the deliver pass, and then the mockups. Ask the person which steps the centre piece should show: these four stages, or the nine steps from their spiral worksheet.

Finish with a short note for the person: the intent, the nine keywords, the three seeds and readings, and links to every board and mockup. Remind them that generated copy is placeholder and should be rewritten by hand.
