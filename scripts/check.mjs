/**
 * Automated checks for the Flight Recovery MCP domain logic.
 *
 * Run after `npm run build`:
 *   npm run check
 */

import {
  getMockFlights,
  getMockAlternatives,
  rankAlternatives,
  getMeetingDeadline,
  getHotelCheckInDeadline,
  getDinnerDeadline,
  getOriginalTransferPickupTime
} from '../dist/modules/flight-recovery/flight-recovery.domain.js';
import { FlightRecoveryTools } from '../dist/modules/flight-recovery/flight-recovery.tools.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERT FAILED: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`ASSERT FAILED: ${message}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

function assertAllFuture() {
  const now = Date.now();
  const allTimestamps = [];

  for (const flight of Object.values(getMockFlights())) {
    allTimestamps.push(flight.scheduled_departure, flight.scheduled_arrival);
    if (flight.estimated_departure) allTimestamps.push(flight.estimated_departure);
    if (flight.estimated_arrival) allTimestamps.push(flight.estimated_arrival);
  }

  for (const alt of getMockAlternatives()) {
    allTimestamps.push(alt.departure, alt.arrival);
    if (alt.worst_case_arrival) allTimestamps.push(alt.worst_case_arrival);
  }

  allTimestamps.push(
    getMeetingDeadline(),
    getHotelCheckInDeadline(),
    getDinnerDeadline(),
    getOriginalTransferPickupTime()
  );

  for (const ts of allTimestamps) {
    assert(
      Date.parse(ts) > now,
      `Fixture timestamp must be in the future: ${ts}`
    );
  }

  console.log(`✓ All ${allTimestamps.length} fixture timestamps are in the future.`);
}

function assertRankingOutcomes() {
  const protectMeeting = rankAlternatives('protect_meeting');
  assertEqual(
    protectMeeting[0].id,
    'MOCK-ALT-102',
    'protect_meeting should rank MOCK-ALT-102 first'
  );
  assert(
    protectMeeting[0].id !== 'MOCK-ALT-101',
    'protect_meeting should NOT rank MOCK-ALT-101 first'
  );
  assertEqual(
    protectMeeting[0].recommended_alternate_id ?? protectMeeting[0].id,
    'MOCK-ALT-102',
    'protect_meeting top entry is the recommended alternate'
  );

  const earliestArrival = rankAlternatives('earliest_arrival');
  assertEqual(
    earliestArrival[0].id,
    'MOCK-ALT-101',
    'earliest_arrival should rank MOCK-ALT-101 first'
  );

  const lowestCost = rankAlternatives('lowest_cost');
  assertEqual(
    lowestCost[0].id,
    'MOCK-ALT-103',
    'lowest_cost should rank the cheapest alternate first'
  );

  console.log('✓ Ranking outcomes are correct for all three priorities.');
}

function assertVerdictFields() {
  for (const priority of ['protect_meeting', 'earliest_arrival', 'lowest_cost']) {
    const ranking = rankAlternatives(priority);
    assert(ranking.length > 0, `Ranking should not be empty for ${priority}`);
    assertEqual(
      ranking[0].rank,
      1,
      'Top ranked alternate should have rank 1'
    );
    assert(
      Array.isArray(ranking[0].keeps),
      'Top entry should have a keeps array'
    );
    assert(
      Array.isArray(ranking[0].at_risk),
      'Top entry should have an at_risk array'
    );
    assert(
      Array.isArray(ranking[0].loses),
      'Top entry should have a loses array'
    );
  }

  console.log('✓ Verdict fields are present on ranking entries.');
}

function assertWorstCase() {
  const ranking = rankAlternatives('protect_meeting');
  const alt101 = ranking.find((r) => r.id === 'MOCK-ALT-101');
  assert(alt101, 'MOCK-ALT-101 should be in the ranking');
  assert(
    alt101.worst_case && alt101.worst_case.includes('missed'),
    'MOCK-ALT-101 should expose a worst_case missed-connection message'
  );
  assert(
    alt101.at_risk.includes('downstream_meeting'),
    'MOCK-ALT-101 should put the downstream meeting at risk'
  );

  console.log('✓ Worst-case consequence is encoded for fragile connections.');
}

function collectStrings(obj, path = '', strings = []) {
  if (obj === null || obj === undefined) return strings;
  if (typeof obj === 'string') {
    strings.push({ path, value: obj });
    return strings;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => collectStrings(item, `${path}[${i}]`, strings));
    return strings;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      collectStrings(value, path ? `${path}.${key}` : key, strings);
    }
    return strings;
  }
  return strings;
}

async function assertToolOutputs() {
  const mockCtx = {
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {}
    }
  };
  const tools = new FlightRecoveryTools();

  const step1 = await tools.assessDisruption({ flight_id: 'DEMO-BLR-DEL-001' }, mockCtx);
  const step2 = await tools.mapBlastRadius({ flight_id: 'DEMO-BLR-DEL-001' }, mockCtx);
  const step3 = await tools.rankAlternates(
    { flight_id: 'DEMO-BLR-DEL-001', priority: 'protect_meeting' },
    mockCtx
  );
  const step4 = await tools.planRecovery(
    { flight_id: 'DEMO-BLR-DEL-001', priority: 'protect_meeting' },
    mockCtx
  );

  const allOutputs = { step1, step2, step3, step4 };
  const strings = collectStrings(allOutputs);
  const badTimestamps = strings.filter(
    (s) => s.value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/) || s.value.endsWith('Z')
  );

  assert(
    badTimestamps.length === 0,
    `Output timestamps must not end with 'Z': ${badTimestamps
      .map((s) => `${s.path}=${s.value}`)
      .join(', ')}`
  );

  // Every timestamp-like field should have a matching _display sibling.
  function assertDisplayPair(obj, path = '') {
    if (obj === null || obj === undefined || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => assertDisplayPair(item, `${path}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (
        typeof value === 'string' &&
        value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
      ) {
        const displayKey = `${key}_display`;
        assert(
          displayKey in obj,
          `Missing ${displayKey} for timestamp at ${currentPath}`
        );
        assert(
          obj[displayKey].includes('IST'),
          `Display field ${displayKey} must include 'IST' at ${currentPath}`
        );
      }
      assertDisplayPair(value, currentPath);
    }
  }

  assertDisplayPair(allOutputs);

  // Priority / recommendation consistency
  assertEqual(step3.priority_used, 'protect_meeting', 'rank_alternates must include priority_used');
  assertEqual(step4.priority_used, 'protect_meeting', 'plan_recovery must include priority_used');
  assertEqual(
    step3.recommended_alternate_id,
    step3.ranking[0].id,
    'recommended_alternate_id must equal ranking[0]'
  );
  assertEqual(
    step4.recommended_alternate_id,
    step4.ranking[0].id,
    'recommended_alternate_id must equal ranking[0]'
  );
  assertEqual(
    step4.recommended_alternate_id,
    'MOCK-ALT-102',
    'recommended_alternate_id should be MOCK-ALT-102 for protect_meeting'
  );

  console.log('✓ Tool outputs use +05:30 timestamps with IST display fields.');
  console.log('✓ priority_used and recommended_alternate_id are consistent.');
}

async function run() {
  assertAllFuture();
  assertRankingOutcomes();
  assertVerdictFields();
  assertWorstCase();
  await assertToolOutputs();
  console.log('\nAll checks passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
