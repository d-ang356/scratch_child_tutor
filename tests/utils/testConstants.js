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

module.exports = { FULL_CONVERSATION_DATA, MEOW_CONVERSATION_DATA, wedoBlocks, meowBlocks };