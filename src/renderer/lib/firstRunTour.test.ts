import assert from 'node:assert/strict';

import { FIRST_RUN_TOUR_STEPS } from './firstRunTour';

async function main() {
  assert.ok(FIRST_RUN_TOUR_STEPS.length >= 3, 'tour should have multiple steps');
  for (const step of FIRST_RUN_TOUR_STEPS) {
    assert.ok(step.title.length > 0, 'each step needs a title');
    assert.ok(step.description.length > 0, 'each step needs a description');
    assert.ok(typeof step.target.x === 'number', 'step target needs x');
    assert.ok(typeof step.target.y === 'number', 'step target needs y');
  }

  console.log('first-run tour data ok');
}

void main();
