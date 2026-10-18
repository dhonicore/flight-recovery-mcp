import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';

/**
 * Synthetic demo fixtures for the Flight Recovery MCP workflow.
 * All data is explicitly labelled as synthetic; it is not live airline data.
 */

const DEMO_SCENARIO_TIME = '2026-10-17T21:00:00+05:30' as const;

const MOCK_FLIGHTS = {
  'DEMO-BLR-DEL-001': {
    flight_id: 'DEMO-BLR-DEL-001',
    route: { origin: 'BLR', destination: 'DEL' },
    scheduled_departure: '2026-10-17T06:30:00+05:30',
    scheduled_arrival: '2026-10-17T09:15:00+05:30',
    status: 'cancelled' as const,
    reported_cause: 'operational_issue',
    estimated_departure: null,
    estimated_arrival: null,
    delay_minutes: null
  },
  'DEMO-BLR-DEL-002': {
    flight_id: 'DEMO-BLR-DEL-002',
    route: { origin: 'BLR', destination: 'DEL' },
    scheduled_departure: '2026-10-17T14:00:00+05:30',
    scheduled_arrival: '2026-10-17T16:45:00+05:30',
    status: 'delayed' as const,
    reported_cause: 'weather',
    estimated_departure: '2026-10-17T16:00:00+05:30',
    estimated_arrival: '2026-10-17T18:45:00+05:30',
    delay_minutes: 120
  }
} as const;

type MockFlightId = keyof typeof MOCK_FLIGHTS;
type RecoveryPriority = 'earliest_arrival' | 'lowest_delay';

/**
 * Synthetic alternative flights for next-day rebooking.
 * Moved to 2026-10-18 so they remain in the future relative to the
 * demo scenario time (2026-10-17T21:00:00+05:30).
 */
const MOCK_ALTERNATIVES = [
  {
    flight_id: 'MOCK-ALT-101',
    route: { origin: 'BLR', destination: 'DEL' },
    departure: '2026-10-18T17:00:00+05:30',
    arrival: '2026-10-18T19:45:00+05:30',
    estimated_delay_minutes: 30
  },
  {
    flight_id: 'MOCK-ALT-102',
    route: { origin: 'BLR', destination: 'DEL' },
    departure: '2026-10-18T18:15:00+05:30',
    arrival: '2026-10-18T20:30:00+05:30',
    estimated_delay_minutes: 0
  }
] as const;

function getAffectedCommitments(status: 'cancelled' | 'delayed') {
  return status === 'cancelled'
    ? [
        {
          commitment: 'Airport transfer',
          impact: 'Original pickup time may no longer work',
          severity: 'high'
        },
        {
          commitment: 'Hotel check-in',
          impact: 'Arrival may move beyond the planned check-in time',
          severity: 'high'
        },
        {
          commitment: 'Downstream meeting',
          impact: 'The planned arrival may no longer allow enough travel time',
          severity: 'high'
        }
      ]
    : [
        {
          commitment: 'Airport transfer',
          impact: 'Pickup may need to move to match the revised arrival',
          severity: 'medium'
        },
        {
          commitment: 'Hotel check-in',
          impact: 'The later arrival may affect the planned check-in',
          severity: 'medium'
        },
        {
          commitment: 'Downstream meeting',
          impact: 'The delay may reduce the available buffer before the meeting',
          severity: 'high'
        }
      ];
}

function rankAlternatives(priority: RecoveryPriority) {
  const ranked = [...MOCK_ALTERNATIVES]
    .sort((a, b) => {
      if (priority === 'earliest_arrival') {
        return Date.parse(a.arrival) - Date.parse(b.arrival);
      }
      return a.estimated_delay_minutes - b.estimated_delay_minutes;
    })
    .map((alternative, index) => ({
      rank: index + 1,
      ...alternative,
      reason:
        priority === 'earliest_arrival'
          ? 'Ranked by earliest listed arrival time.'
          : 'Ranked by lowest listed estimated delay.'
    }));

  return ranked;
}

export class FlightRecoveryTools {
  @Tool({
    name: 'assess_disruption',
    description:
      'Step 1 in the recovery workflow. Assess a synthetic flight disruption. Returns flight status, reported cause, timing impact, preliminary guidance, and missing information. Use DEMO-BLR-DEL-001 (cancelled) or DEMO-BLR-DEL-002 (delayed). All data is synthetic.',
    inputSchema: z.object({
      flight_id: z
        .enum(['DEMO-BLR-DEL-001', 'DEMO-BLR-DEL-002'])
        .describe(
          'Synthetic flight identifier. DEMO-BLR-DEL-001 = cancelled morning flight; DEMO-BLR-DEL-002 = delayed afternoon flight.'
        )
    }),
    examples: {
      request: { flight_id: 'DEMO-BLR-DEL-001' },
      response: {
        data_source: 'mock_fixture',
        notice: 'Synthetic demo data only. This is not live airline information.',
        flight_id: 'DEMO-BLR-DEL-001',
        status: 'cancelled',
        reported_cause: 'operational_issue',
        delay_minutes: null,
        preliminary_assessment: {
          potential_next_step:
            'Check rebooking options and the applicable airline/booking-channel policy.',
          entitlement_status: 'not_verified'
        },
        missing_information: [
          'Booking channel',
          'Airline policy for this booking',
          'Traveller priorities and downstream commitments'
        ]
      }
    }
  })
  async assessDisruption(
    input: { flight_id: MockFlightId },
    ctx: ExecutionContext
  ) {
    const flight = MOCK_FLIGHTS[input.flight_id];

    ctx.logger.info('Assessing synthetic flight disruption', {
      flight_id: input.flight_id,
      status: flight.status
    });

    return {
      data_source: 'mock_fixture',
      notice: 'Synthetic demo data only. This is not live airline information.',
      ...flight,
      preliminary_assessment: {
        potential_next_step:
          flight.status === 'cancelled'
            ? 'Check rebooking options and the applicable airline/booking-channel policy.'
            : 'Monitor the updated arrival estimate and check downstream deadlines.',
        entitlement_status: 'not_verified',
        explanation:
          'No entitlement is confirmed because the booking channel, ticket conditions, and applicable policy have not been checked.'
      },
      missing_information: [
        'Booking channel',
        'Airline policy for this booking',
        'Traveller priorities and downstream commitments'
      ]
    };
  }

  @Tool({
    name: 'map_blast_radius',
    description:
      'Step 2 in the recovery workflow. Map the downstream commitments potentially affected by a synthetic flight disruption. Returns synthetic impacts and their severity.',
    inputSchema: z.object({
      flight_id: z
        .enum(['DEMO-BLR-DEL-001', 'DEMO-BLR-DEL-002'])
        .describe('Synthetic flight identifier.')
    }),
    examples: {
      request: { flight_id: 'DEMO-BLR-DEL-001' },
      response: {
        data_source: 'mock_fixture',
        notice:
          'Synthetic potential impacts only. No actual bookings or commitments have been checked.',
        flight_id: 'DEMO-BLR-DEL-001',
        flight_status: 'cancelled',
        affected_commitments: [
          {
            commitment: 'Airport transfer',
            impact: 'Original pickup time may no longer work',
            severity: 'high'
          }
        ],
        next_step:
          'Confirm the traveller’s actual bookings, commitment times, and priorities before making changes.'
      }
    }
  })
  async mapBlastRadius(
    input: { flight_id: MockFlightId },
    ctx: ExecutionContext
  ) {
    const flight = MOCK_FLIGHTS[input.flight_id];

    ctx.logger.info('Mapping synthetic flight disruption impacts', {
      flight_id: input.flight_id,
      status: flight.status
    });

    return {
      data_source: 'mock_fixture',
      notice:
        'Synthetic potential impacts only. No actual bookings or commitments have been checked.',
      flight_id: flight.flight_id,
      flight_status: flight.status,
      affected_commitments: getAffectedCommitments(flight.status),
      next_step:
        'Confirm the traveller’s actual bookings, commitment times, and priorities before making changes.'
    };
  }

  @Tool({
    name: 'rank_alternates',
    description:
      'Step 3 in the recovery workflow. Rank synthetic alternative flights by earliest arrival or lowest delay. Does not check live schedules, availability, or fares.',
    inputSchema: z.object({
      flight_id: z.enum(['DEMO-BLR-DEL-001', 'DEMO-BLR-DEL-002']),
      priority: z
        .enum(['earliest_arrival', 'lowest_delay'])
        .describe('What matters most to the traveller.')
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'earliest_arrival'
      },
      response: {
        data_source: 'mock_fixture',
        notice:
          'Synthetic alternatives only. Flight schedules, seat availability, fares, and rebooking eligibility have not been verified.',
        disrupted_flight_id: 'DEMO-BLR-DEL-001',
        disrupted_flight_status: 'cancelled',
        ranking_priority: 'earliest_arrival',
        ranked_alternatives: [
          {
            rank: 1,
            flight_id: 'MOCK-ALT-101',
            route: { origin: 'BLR', destination: 'DEL' },
            departure: '2026-10-18T17:00:00+05:30',
            arrival: '2026-10-18T19:45:00+05:30',
            estimated_delay_minutes: 30,
            reason: 'Ranked by earliest listed arrival time.'
          }
        ],
        next_step:
          'Verify live schedules, seat availability, fare differences, and rebooking conditions before recommending a booking.'
      }
    }
  })
  async rankAlternates(
    input: {
      flight_id: MockFlightId;
      priority: RecoveryPriority;
    },
    ctx: ExecutionContext
  ) {
    const original = MOCK_FLIGHTS[input.flight_id];

    const ranked = rankAlternatives(input.priority);

    ctx.logger.info('Ranked synthetic alternative flights', {
      flight_id: input.flight_id,
      priority: input.priority
    });

    return {
      data_source: 'mock_fixture',
      notice:
        'Synthetic alternatives only. Flight schedules, seat availability, fares, and rebooking eligibility have not been verified.',
      disrupted_flight_id: original.flight_id,
      disrupted_flight_status: original.status,
      ranking_priority: input.priority,
      ranked_alternatives: ranked,
      next_step:
        'Verify live schedules, seat availability, fare differences, and rebooking conditions before recommending a booking.'
    };
  }

  @Tool({
    name: 'plan_recovery',
    description:
      'Step 4 in the recovery workflow. Create a consolidated, synthetic flight recovery plan. Reuses the disruption assessment, blast-radius mapping, and alternative ranking. Returns a clear recommendation with explicit reasons and actionable next steps. Does not verify live flight availability, bookings, fares, or entitlements.',
    inputSchema: z.object({
      flight_id: z.enum(['DEMO-BLR-DEL-001', 'DEMO-BLR-DEL-002']),
      priority: z
        .enum(['earliest_arrival', 'lowest_delay'])
        .describe('Traveller priority for ranking alternative flights.')
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'earliest_arrival'
      },
      response: {
        data_source: 'mock_fixture',
        notice:
          'Demonstration plan based entirely on synthetic data. Alternative flights, actual commitments, live availability, fares, rebooking eligibility, and passenger entitlements have not been verified.',
        scenario_time: '2026-10-17T21:00:00+05:30',
        disruption: {
          flight_id: 'DEMO-BLR-DEL-001',
          route: { origin: 'BLR', destination: 'DEL' },
          status: 'cancelled'
        },
        impact_assessment: {
          affected_commitments: [
            {
              commitment: 'Airport transfer',
              impact: 'Original pickup time may no longer work',
              severity: 'high'
            }
          ]
        },
        synthetic_passenger_commitments: [
          {
            commitment: 'Airport transfer',
            fixture_scheduled_time: '2026-10-17T09:45:00+05:30',
            buffer_minutes: 30,
            status: 'at_risk',
            reason:
              'Fixture pickup at 09:45 IST is before the 21:00 IST scenario time and has likely been missed; reschedule after rebooking.'
          }
        ],
        alternative_options: {
          ranking_priority: 'earliest_arrival',
          ranked_alternatives: [
            {
              rank: 1,
              flight_id: 'MOCK-ALT-101',
              route: { origin: 'BLR', destination: 'DEL' },
              departure: '2026-10-18T17:00:00+05:30',
              arrival: '2026-10-18T19:45:00+05:30',
              estimated_delay_minutes: 30,
              reason: 'Ranked by earliest listed arrival time.'
            }
          ]
        },
        recommendation: {
          recommended_flight_id: 'MOCK-ALT-101',
          reason:
            'Earliest listed arrival among the synthetic alternatives for the chosen priority.',
          estimated_departure: '2026-10-18T17:00:00+05:30',
          estimated_arrival: '2026-10-18T19:45:00+05:30'
        },
        recommended_actions: [
          'Confirm the disruption with the airline or booking provider.',
          'Verify alternative flight schedules, seat availability, fares, and rebooking conditions.',
          'Check actual airport transfer, hotel, and meeting arrangements.',
          'Review the applicable ticket terms and airline policy before assessing entitlements.',
          'Confirm the traveller’s preferred option before making changes.'
        ],
        entitlement_status: 'not_verified',
        next_step:
          'Verify live information and the traveller’s actual commitments before making a rebooking decision.'
      }
    }
  })
  async planRecovery(
    input: {
      flight_id: MockFlightId;
      priority: RecoveryPriority;
    },
    ctx: ExecutionContext
  ) {
    const flight = MOCK_FLIGHTS[input.flight_id];
    const rankedAlternatives = rankAlternatives(input.priority);
    const topAlternative = rankedAlternatives[0];

    ctx.logger.info('Created synthetic flight recovery plan', {
      flight_id: input.flight_id,
      status: flight.status,
      priority: input.priority
    });

    return {
      data_source: 'mock_fixture',
      notice:
        'Demonstration plan based entirely on synthetic data. Alternative flights, actual commitments, live availability, fares, rebooking eligibility, and passenger entitlements have not been verified.',
      scenario_time: DEMO_SCENARIO_TIME,
      disruption: {
        flight_id: flight.flight_id,
        route: flight.route,
        status: flight.status,
        reported_cause: flight.reported_cause,
        scheduled_departure: flight.scheduled_departure,
        scheduled_arrival: flight.scheduled_arrival,
        estimated_departure: flight.estimated_departure,
        estimated_arrival: flight.estimated_arrival,
        delay_minutes: flight.delay_minutes
      },
      impact_assessment: {
        affected_commitments: getAffectedCommitments(flight.status),
        notice:
          'Potential impacts only; no actual bookings or commitments have been checked.'
      },
      synthetic_passenger_commitments: [
        {
          commitment: 'Airport transfer',
          fixture_scheduled_time: '2026-10-17T09:45:00+05:30',
          buffer_minutes: 30,
          status: 'at_risk',
          reason:
            'Fixture pickup at 09:45 IST is before the 21:00 IST scenario time and has likely been missed; reschedule after rebooking.'
        },
        {
          commitment: 'Hotel check-in',
          fixture_scheduled_time: '2026-10-17T15:00:00+05:30',
          buffer_minutes: 0,
          status: 'at_risk',
          reason:
            'Fixture check-in at 15:00 IST is before the 21:00 IST scenario time and may already be missed; next-day arrival likely requires rescheduling.'
        },
        {
          commitment: 'Downstream meeting',
          fixture_scheduled_time: '2026-10-17T19:00:00+05:30',
          buffer_minutes: 60,
          status: 'at_risk',
          reason:
            'Fixture meeting at 19:00 IST is before the 21:00 IST scenario time and has likely been missed; reschedule after rebooking.'
        }
      ],
      alternative_options: {
        ranking_priority: input.priority,
        ranked_alternatives: rankedAlternatives
      },
      recommendation: {
        recommended_flight_id: topAlternative.flight_id,
        reason:
          input.priority === 'earliest_arrival'
            ? 'Earliest listed arrival among the synthetic alternatives for the chosen priority.'
            : 'Lowest listed estimated delay among the synthetic alternatives for the chosen priority.',
        estimated_departure: topAlternative.departure,
        estimated_arrival: topAlternative.arrival
      },
      recommended_actions: [
        'Confirm the disruption with the airline or booking provider.',
        'Verify alternative flight schedules, seat availability, fares, and rebooking conditions.',
        'Check actual airport transfer, hotel, and meeting arrangements.',
        'Review the applicable ticket terms and airline policy before assessing entitlements.',
        'Confirm the traveller’s preferred option before making changes.'
      ],
      entitlement_status: 'not_verified',
      next_step:
        'Verify live information and the traveller’s actual commitments before making a rebooking decision.'
    };
  }
}
