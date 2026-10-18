/**
 * Live verification against the deployed Render instance.
 *
 * Runs the verification prompt workflow 3 times and checks pass criteria.
 * Usage: LIVE_URL=https://flight-recovery-mcp.onrender.com node scripts/live-verify.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const LIVE_URL = process.env.LIVE_URL || 'https://flight-recovery-mcp.onrender.com';
const VERIFICATION_PROMPT =
  'My flight DEMO-BLR-DEL-001 just got cancelled. I have a client dinner, a hotel with late check-in, and a 9:30 AM meeting that matters most, so a missed connection is not acceptable. Fix my trip.';

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.find((c) => c.type === 'text')?.text;
  if (!text) {
    throw new Error(`Tool ${name} returned no text content`);
  }
  return JSON.parse(text);
}

async function runOnce(runNumber) {
  const url = new URL('/sse', LIVE_URL);
  const transport = new SSEClientTransport(url);
  const client = new Client({ name: `live-verify-${runNumber}`, version: '1.0.0' });

  await client.connect(transport);

  try {
    const step1 = await callTool(client, 'assess_disruption', {
      flight_id: 'DEMO-BLR-DEL-001'
    });
    const step2 = await callTool(client, 'map_blast_radius', {
      flight_id: 'DEMO-BLR-DEL-001'
    });
    const step3 = await callTool(client, 'rank_alternates', {
      flight_id: 'DEMO-BLR-DEL-001',
      priority: 'protect_meeting'
    });
    const step4 = await callTool(client, 'plan_recovery', {
      flight_id: 'DEMO-BLR-DEL-001',
      priority: 'protect_meeting'
    });

    const checks = {
      order: step1 && step2 && step3 && step4 ? true : false,
      recommends102: step4.recommended_alternate_id === 'MOCK-ALT-102',
      rankRecommends102: step3.recommended_alternate_id === 'MOCK-ALT-102',
      explains101loses:
        (step3.decision_rule || '').includes('MOCK-ALT-101') &&
        (step3.decision_rule || '').includes('missed connection'),
      syntheticNotice:
        (step4.notice || '').includes('Synthetic') &&
        (step4.notice || '').includes('proposals'),
      actionsRequireApproval:
        Array.isArray(step4.recommended_actions) &&
        step4.recommended_actions.length > 0 &&
        step4.recommended_actions.every(
          (a) => a.requires_user_approval === true && a.executed === false
        ),
      futureDates:
        new Date(step4.meeting_deadline) > new Date() &&
        step4.ranking.every((r) => new Date(r.arrival) > new Date())
    };

    const passed = Object.values(checks).every(Boolean);

    return {
      run: runNumber,
      passed,
      checks,
      recommended: step4.recommended_alternate_id
    };
  } finally {
    await client.close();
  }
}

async function main() {
  console.log(`Warming ${LIVE_URL}...`);
  const warm = await fetch(LIVE_URL);
  console.log(`Warm response: ${warm.status}`);

  console.log(`\nRunning verification prompt 3 times against ${LIVE_URL}`);
  console.log(`Prompt: ${VERIFICATION_PROMPT}\n`);

  const results = [];
  for (let i = 1; i <= 3; i++) {
    try {
      const result = await runOnce(i);
      results.push(result);
      console.log(`Run ${i}: ${result.passed ? 'PASS' : 'FAIL'} (${result.recommended})`);
    } catch (err) {
      console.error(`Run ${i}: ERROR`, err.message);
      results.push({ run: i, passed: false, error: err.message });
    }
  }

  const passCount = results.filter((r) => r.passed).length;
  console.log(`\nPassed ${passCount}/3 runs`);

  if (passCount >= 2) {
    console.log('Live verification PASSED (>=2/3).');
    process.exit(0);
  } else {
    console.log('Live verification FAILED (<2/3).');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
