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
  getOriginalTransferPickupTime,
  at,
  toDisplay
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

  console.log('✓ Default ranking outcomes are correct for all three priorities.');
}

function assertVerdictFields() {
  for (const priority of ['protect_meeting', 'earliest_arrival', 'lowest_cost']) {
    const ranking = rankAlternatives(priority);
    assert(ranking.length > 0, `Ranking should not be empty for ${priority}`);
    assertEqual(ranking[0].rank, 1, 'Top ranked alternate should have rank 1');
    assert(Array.isArray(ranking[0].keeps), 'Top entry should have a keeps array');
    assert(Array.isArray(ranking[0].at_risk), 'Top entry should have an at_risk array');
    assert(Array.isArray(ranking[0].loses), 'Top entry should have a loses array');
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
  const step4NoPriority = await tools.planRecovery(
    { flight_id: 'DEMO-BLR-DEL-001' },
    mockCtx
  );

  const allOutputs = { step1, step2, step3, step4, step4NoPriority };
  const strings = collectStrings(allOutputs);
  const badTimestamps = strings.filter((s) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s.value)
  );

  assert(
    badTimestamps.length === 0,
    `Output timestamps must not end with 'Z': ${badTimestamps
      .map((s) => `${s.path}=${s.value}`)
      .join(', ')}`
  );

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
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value)
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

  assertEqual(step3.priority_used, 'protect_meeting', 'rank_alternates must include priority_used');
  assertEqual(step4.priority_used, 'protect_meeting', 'plan_recovery must include priority_used');
  assertEqual(
    step4NoPriority.priority_used,
    'protect_meeting',
    'plan_recovery must default priority to protect_meeting'
  );
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

  // Time-offset regression: 09:30 meeting must appear correctly.
  assert(
    step4.meeting_deadline.endsWith('T09:30:00+05:30'),
    `meeting_deadline should end with T09:30:00+05:30, got ${step4.meeting_deadline}`
  );
  assert(
    step4.meeting_deadline_display.includes('09:30') && step4.meeting_deadline_display.includes('IST'),
    `meeting_deadline_display should show 09:30 IST, got ${step4.meeting_deadline_display}`
  );

  // Draft messages
  assert(step4.draft_messages.client_message, 'client_message should exist');
  assert(step4.draft_messages.hotel_message, 'hotel_message should exist');
  assert(
    !step4.draft_messages.meeting_organizer_message,
    'meeting_organizer_message should not exist when meeting is kept'
  );
  assertEqual(
    step4.draft_messages.client_message.status,
    'draft_not_sent',
    'draft message status should be draft_not_sent'
  );

  console.log('✓ Tool outputs use +05:30 timestamps with IST display fields.');
  console.log('✓ priority_used and recommended_alternate_id are consistent.');
  console.log('✓ Draft messages present with correct status.');
}

async function assertCommitmentOverrides() {
  const mockCtx = { logger: { info: () => {}, error: () => {}, warn: () => {} } };
  const tools = new FlightRecoveryTools();

  // Meeting moved 7 days later: nothing should miss the meeting; 102 and 103 kept.
  const laterMeeting = at(10, '09:30');
  const step3Later = await tools.rankAlternates(
    { flight_id: 'DEMO-BLR-DEL-001', priority: 'protect_meeting', meeting_start: laterMeeting },
    mockCtx
  );
  assert(
    step3Later.ranking.every((r) => !r.loses.includes('downstream_meeting')),
    'No option should miss the meeting when it is moved 7 days later'
  );
  const alt102Later = step3Later.ranking.find((r) => r.id === 'MOCK-ALT-102');
  const alt103Later = step3Later.ranking.find((r) => r.id === 'MOCK-ALT-103');
  assert(
    alt102Later && alt102Later.keeps.includes('downstream_meeting'),
    'MOCK-ALT-102 should keep the delayed meeting'
  );
  assert(
    alt103Later && alt103Later.keeps.includes('downstream_meeting'),
    'MOCK-ALT-103 should keep the delayed meeting'
  );
  assertEqual(
    step3Later.commitments_used.commitments_source,
    'caller_provided',
    'commitments_source should be caller_provided when overrides given'
  );

  // Meeting 1 hour after 102 arrival: 102 meeting should be at_risk or missed.
  const tightMeeting = at(2, '21:30');
  const step3Tight = await tools.rankAlternates(
    { flight_id: 'DEMO-BLR-DEL-001', priority: 'protect_meeting', meeting_start: tightMeeting },
    mockCtx
  );
  const alt102Tight = step3Tight.ranking.find((r) => r.id === 'MOCK-ALT-102');
  assert(
    alt102Tight &&
      (alt102Tight.at_risk.includes('downstream_meeting') ||
        alt102Tight.loses.includes('downstream_meeting')),
    'MOCK-ALT-102 meeting should be at_risk or missed when meeting is 1h after arrival'
  );

  // Invalid ISO should return JSON error.
  const errResult = await tools.rankAlternates(
    { flight_id: 'DEMO-BLR-DEL-001', priority: 'protect_meeting', meeting_start: 'not-a-date' },
    mockCtx
  );
  assert(errResult.error, 'Invalid ISO input should return an error');
  assert(errResult.field, 'Error should include the field name');

  const zResult = await tools.rankAlternates(
    { flight_id: 'DEMO-BLR-DEL-001', priority: 'protect_meeting', meeting_start: '2026-10-20T09:30:00Z' },
    mockCtx
  );
  assert(zResult.error, 'Trailing Z should be rejected');

  console.log('✓ Commitment override behavior and validation work as expected.');
}

async function run() {
  assertAllFuture();
  assertRankingOutcomes();
  assertVerdictFields();
  assertWorstCase();
  await assertToolOutputs();
  await assertCommitmentOverrides();
  console.log('\nAll checks passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
