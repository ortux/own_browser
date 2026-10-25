import assert from 'node:assert/strict';

import { FIRST_RUN_TOUR_STEPS } from './firstRunTour';

async function main() {
  assert.ok(FIRST_RUN_TOUR_STEPS.length >= 3, 'tour should have multiple steps');

  const ids = new Set<string>();

  for (const step of FIRST_RUN_TOUR_STEPS) {
    assert.ok(step.id.length > 0, 'each step needs an id');
    assert.ok(!ids.has(step.id), `duplicate step id: ${step.id}`);
    ids.add(step.id);

    assert.ok(step.title.length > 0, 'each step needs a title');
    assert.ok(step.description.length > 0, 'each step needs a description');
    assert.ok(step.pointerText.length > 0, 'each step needs a pointerText');

    // selector must be a non-empty string targeting a data-tour attribute
    assert.ok(typeof step.selector === 'string' && step.selector.length > 0, 'each step needs a selector');
    assert.ok(
      step.selector.includes('data-tour'),
      `selector should target a data-tour attribute, got: "${step.selector}"`,
    );

    // padding is optional but must be a non-negative number if present
    if (step.padding !== undefined) {
      assert.ok(typeof step.padding === 'number' && step.padding >= 0, 'padding must be a non-negative number');
    }

    // cardPlacement is optional but must be a known value if present
    const validPlacements = ['auto', 'top', 'bottom', 'left', 'right'];
    if (step.cardPlacement !== undefined) {
      assert.ok(
        validPlacements.includes(step.cardPlacement),
        `cardPlacement must be one of ${validPlacements.join(', ')}, got: "${step.cardPlacement}"`,
      );
    }
  }

  console.log(`first-run tour data ok (${FIRST_RUN_TOUR_STEPS.length} steps)`);
}

void main();
