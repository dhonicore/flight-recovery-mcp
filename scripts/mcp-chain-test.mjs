/**
 * End-to-end MCP workflow test using the local HTTP/SSE endpoint.
 *
 * Assumes the server is already running on http://localhost:3000.
 * Usage:
 *   npm start &
 *   node scripts/mcp-chain-test.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.find((c) => c.type === 'text')?.text;
  if (!text) {
    throw new Error(`Tool ${name} returned no text content`);
  }
  return JSON.parse(text);
}

async function main() {
  const transport = new SSEClientTransport(new URL('http://localhost:3000/sse'));
  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await client.connect(transport);

  try {
    const step1 = await callTool(client, 'assess_disruption', {
      flight_id: 'DEMO-BLR-DEL-001'
    });
    console.log('Step 1 assess_disruption:', step1.status);

    const step2 = await callTool(client, 'map_blast_radius', {
      flight_id: 'DEMO-BLR-DEL-001'
    });
    console.log('Step 2 map_blast_radius:', step2.flight_status);

    const step3 = await callTool(client, 'rank_alternates', {
      flight_id: 'DEMO-BLR-DEL-001',
      priority: 'protect_meeting'
    });
    console.log('Step 3 rank_alternates recommended:', step3.recommended_alternate_id);

    const step4 = await callTool(client, 'plan_recovery', {
      flight_id: 'DEMO-BLR-DEL-001',
      priority: 'protect_meeting'
    });
    console.log('Step 4 plan_recovery recommended:', step4.recommended_alternate_id);

    // Assertions
    if (step1.status !== 'cancelled') {
      throw new Error('Expected cancelled status');
    }
    if (step3.recommended_alternate_id !== 'MOCK-ALT-102') {
      throw new Error(`Expected MOCK-ALT-102, got ${step3.recommended_alternate_id}`);
    }
    if (step4.recommended_alternate_id !== 'MOCK-ALT-102') {
      throw new Error(`Expected MOCK-ALT-102, got ${step4.recommended_alternate_id}`);
    }
    if (!step3.ranking || step3.ranking.length !== 3) {
      throw new Error('Expected 3 ranked alternatives');
    }
    if (!step4.recommended_actions || step4.recommended_actions.length === 0) {
      throw new Error('Expected recovery actions');
    }
    if (!step4.recommended_actions.every((a) => a.requires_user_approval === true && a.executed === false)) {
      throw new Error('All actions must require approval and not be executed');
    }

    console.log('\nMCP workflow chain test passed.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
