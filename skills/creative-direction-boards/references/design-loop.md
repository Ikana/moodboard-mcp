# Design loop: seed, critic, deliver

Adapted from Anshu Chimala's "How to turn your AI into a world-class designer" (Lenny's Newsletter, Sep 2026). It has three stages: Discover, Define and Deliver.

## Discover: seed the direction

The model's own "random" choices land on the same few patterns. Bring the variety in from outside:

1. Generate a seed string in the shell (`head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40`). Use one fresh seed for each direction.
2. Read the seed for structure: repeated characters, digit shapes (6 and 9 → a figure-eight; 8, Q, O → openings; X, 1 → a single axis), counts and rhythms. Pick one reading that fits the board's keywords, and turn it into a geometry for the centre piece.
3. Write the reading down as one sentence (e.g. "X1 gave the single axis, 4Ez4X the exploded view") and show the seed on the board's text tile. The person should be able to see where the idea came from.
4. Make the brief ambitious and specific, never "make it nice". Name the reference world the piece should feel like (an engraving key, a Turrell skyspace, an orbital chart).

## Define: critic loop

The builder can't judge its own work. After each build:

1. Screenshot the page. Headless Chrome works for 2D: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1440,900 --virtual-time-budget=4000 --screenshot=out.png URL`. For WebGL pages add `--use-angle=swiftshader --enable-unsafe-swiftshader` and serve over http.
2. Start a **fresh subagent** that gets only the screenshot path and this prompt:

   > You are a design critic. Look ONLY at this screenshot: <path>. Context: <one line on what the page is>. The moodboard images are the taste baseline; treat them as a moodboard, not a target to copy. 1) Name the aesthetic in one or two sentences. 2) Imagine how a top studio (Pentagram, Experimental Jetset, a museum exhibition-design studio) would execute exactly that aesthetic. 3) List the biggest gaps between this screenshot and that execution, most important first: overall structure and composition first, then fine details (type, alignment, spacing, contrast, line weights, labels). Penalise anything overdone, excessive or obviously AI-generated. Give tight, specific, actionable feedback and be opinionated. 4) Score it out of 10 against that bar. Don't edit files. Reply under 350 words.

3. Apply the fixes, re-screenshot, and run the same prompt in a new subagent. Two rounds usually show whether it's converging. Stop there for a rough draft, and report the scores (the first run went 4.5 → 5.5).

What critics flagged last time, so you can check before the first round: the frame competing with the subject (tone the edge images down or unify them), the diagram too small and floating, labels colliding with the line, three or more type voices (keep two families), cute labels (keep them to two or three words), and mismatched stroke weights.

## Deliver: cut, remove tells, rewrite

- Cut whatever adds nothing: per-tile captions, ghost grids, decorative construction lines, boxed cards.
- Remove AI tells: eyebrow labels, generic gradients, too many cards, too many fonts or styles.
- Treat generated copy as placeholder. Keep labels short and plain, and tell the person that the copy should be rewritten by hand.
- Image and video generation (fal.ai, OpenAI or Gemini) is the article's enrichment step. Mention it as the next step when it isn't connected.
