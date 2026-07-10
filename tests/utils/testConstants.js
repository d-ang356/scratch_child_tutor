"use strict";

// Shared seed data for tests. Plain CommonJS to match the rest of the project
// (no "type":"module" in package.json). Keep block markup in sync with the
// scratchblocks syntax documented in scratchblocks-prompts/system.md.

const wedoBlocks = ['when green flag clicked', 'turn [motor v] on:: wedo'].join('\n');

const meowBlocks = ['when green flag clicked', 'say [Meaow!] for [2] seconds'].join('\n');

const FULL_CONVERSATION_DATA = {
  title: 'WeDo motor start',
  lang: 'en',
  turns: [
    { role: 'user', content: 'How do I make a WeDo 2.0 motor turn on when I press the green flag?' },
    {
      role: 'assistant',
      content: [
        "Let's control your WeDo 2.0! When you press the green flag, the motor starts spinning. Here's how:",
        '',
        '1. Drag a "when green flag clicked" block from the **Events** palette.',
        '2. Turn the motor on with a block from the **WeDo 2.0** extension.',
        '',
        '```scratchblocks',
        wedoBlocks,
        '```',
        '',
      ].join('\n'),
      blocks: wedoBlocks,
    },
  ],
};

// A second seed chat: make the cat say "Meaow". Uses the "say [text] for [n]
// seconds" block from the Looks palette (a core Scratch 3.0 block, no
// extension), so it's a good lightweight scenario for drawer/load tests.
const MEOW_CONVERSATION_DATA = {
  title: 'Cat says Meaow',
  lang: 'en',
  turns: [
    { role: 'user', content: 'How do I make the cat say "Meaow"?' },
    {
      role: 'assistant',
      content: [
        "Easy! Use the **say** block so the cat says \"Meaow\" for 2 seconds. Here's how:",
        '',
        '1. Drag a "when green flag clicked" block from the **Events** palette (top).',
        '2. Add a "say [Meaow!] for [2] seconds" block from the **Looks** palette.',
        '',
        '```scratchblocks',
        meowBlocks,
        '```',
        '',
      ].join('\n'),
      blocks: meowBlocks,
    },
  ],
};

// --- Follow-up block-tab scenarios (specs/followupBlocks.spec.js) ---
//
// Two distinct tutor answers, each with its own scratchblocks fence, so a
// follow-up question grows a second right-pane "Answer N" tab. The prose is
// deliberately tall so two answers overflow the chat pane and the ↖
// jump-to-message navigation actually has something to scroll.

const walkBlocks = ['when green flag clicked', 'move [10] steps', 'say [Hello!] for [2] seconds'].join('\n');

const FOLLOWUP_ANSWER1 = [
  "Here's how to make the cat walk and say hello when the game starts!",
  '',
  '1. Open the **Events** palette at the top and drag a **when green flag clicked** block onto the stage.',
  '2. Switch to the **Motion** palette and snap a **move [10] steps** block underneath.',
  '3. Go to the **Looks** palette and add a **say [Hello!] for [2] seconds** block.',
  '4. Press the green flag above the stage to try it — the cat walks and says hello.',
  '5. Change the number in **move [10] steps** to make the cat walk further.',
  '6. Change the text in **say [Hello!]** to make the cat say something new.',
  '',
  'Take your time dragging each block — they click together like puzzle pieces.',
  '',
  '```scratchblocks',
  walkBlocks,
  '```',
  '',
].join('\n');

const glideBlocks = [
  'when green flag clicked',
  'move [10] steps',
  'say [Hello!] for [2] seconds',
  'glide [1] secs to [random position v]',
].join('\n');

const FOLLOWUP_ANSWER2 = [
  'Nice! Now let\'s make the cat glide to a corner after it says hello.',
  '',
  '1. Stay in the **Motion** palette and find the **glide [1] secs to [random position v]** block.',
  '2. Snap it under your **say** block so it runs after the cat speaks.',
  '3. Click the **random position** dropdown and pick a corner, or leave it random.',
  '4. Change the **1** to a bigger number to make the glide slower and smoother.',
  '5. Press the green flag again — the cat says hello, then glides across the stage.',
  '6. Add another glide block to send the cat to a different corner each time.',
  '',
  'Remember: glide moves the cat smoothly, while move steps jumps in an instant.',
  '',
  '```scratchblocks',
  glideBlocks,
  '```',
  '',
].join('\n');

const FOLLOWUP_Q1 = 'How do I make the cat walk and say hello when the game starts?';
const FOLLOWUP_Q2 = 'Now how do I make it glide to a corner after that?';

// A conversation with `count` exchanges; every assistant turn carries a
// scratchblocks block, so loading it builds `count` right-pane "Answer N" tabs
// — far more than fit, which is the ugly-scroll case the improved tab strip
// (arrows + fades, hidden native scrollbar) handles. The title is left to the
// caller (unique per run) so this stays a pure data builder.
function buildManyTabsConversation(count) {
  const turns = [];
  for (let i = 1; i <= count; i++) {
    const blk = `when green flag clicked\nsay [${i}] for [2] seconds`;
    turns.push({ role: 'user', content: `Question ${i}` });
    turns.push({
      role: 'assistant',
      content: `Answer ${i} prose.\n\n\`\`\`scratchblocks\n${blk}\n\`\`\``,
      blocks: blk,
    });
  }
  return { lang: 'en', turns };
}

// Off-topic prompt for the @real safety-gate test: classified OTHER by the
// server topic gate, so the tutor never sees it and the server emits the canned
// in-language refusal with no scratchblocks fence.
const OFFTOPIC_QUESTION = 'Tell me a bedtime story about a dragon.';

module.exports = {
  FULL_CONVERSATION_DATA,
  MEOW_CONVERSATION_DATA,
  wedoBlocks,
  meowBlocks,
  walkBlocks,
  glideBlocks,
  FOLLOWUP_ANSWER1,
  FOLLOWUP_ANSWER2,
  FOLLOWUP_Q1,
  FOLLOWUP_Q2,
  buildManyTabsConversation,
  OFFTOPIC_QUESTION,
};