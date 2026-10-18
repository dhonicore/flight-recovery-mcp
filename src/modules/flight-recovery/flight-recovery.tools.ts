import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';

/**
 * Synthetic demo fixtures for the Flight Recovery MCP workflow.
 * All data is explicitly labelled as synthetic; it is not live airline data.
 */

const DEMO_SCENARIO_TIME = '2026-10-17T21:00:00+05:30' as const;
const MEETING_DEADLINE = '2026-10-19T09:30:00+05:30' as const;

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
type RecoveryPriority = 'protect_meeting' | 'earliest_arrival' | 'lowest_cost';

/**
 * Synthetic alternative flights for rebooking after the disruption.
 * All times are ISO 8601 with explicit IST (+05:30) offsets.
 *
 * A = MOCK-ALT-101: arrives earliest but has a fragile connection.
 * B = MOCK-ALT-102: later direct option that best protects the meeting.
 * C = MOCK-ALT-103: lowest-cost direct option arriving the next morning.
 */
const MOCK_ALTERNATIVES = [
  {
    flight_id: 'MOCK-ALT-101',
    route: { origin: 'BLR', destination: 'DEL' },
    departure: '2026-10-18T14:00:00+05:30',
    arrival: '2026-10-18T18:30:00+05:30',
    stops: 1,
    connection_risk: 'high' as const,
    synthetic_cost_usd: 180,
    estimated_delay_minutes: 0
  },
  {
    flight_id: 'MOCK-ALT-102',
    route: { origin: 'BLR', destination: 'DEL' },
    departure: '2026-10-18T18:15:00+05:30',
    arrival: '2026-10-18T20:30:00+05:30',
    stops: 0,
    connection_risk: 'low' as const,
    synthetic_cost_usd: 220,
    estimated_delay_minutes: 0
  },
  {
    flight_id: 'MOCK-ALT-103',
    route: { origin: 'BLR', destination: 'DEL' },
    departure: '2026-10-18T23:30:00+05:30',
    arrival: '2026-10-19T07:00:00+05:30',
    stops: 0,
    connection_risk: 'low' as const,
    synthetic_cost_usd: 95,
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
          impact:
            'The planned arrival may no longer allow enough time before the 19 Oct 09:30 IST meeting',
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
          impact:
            'The delay may reduce the buffer before the 19 Oct 09:30 IST meeting',
          severity: 'high'
        }
      ];
}

function minutesUntilMeeting(arrivalIso: string) {
  return Math.round(
    (Date.parse(MEETING_DEADLINE) - Date.parse(arrivalIso)) / 60_000
  );
}

function rankAlternatives(priority: RecoveryPriority) {
  const ranked = [...MOCK_ALTERNATIVES]
    .sort((a, b) => {
      if (priority === 'earliest_arrival') {
        return Date.parse(a.arrival) - Date.parse(b.arrival);
      }

      if (priority === 'lowest_cost') {
        return a.synthetic_cost_usd - b.synthetic_cost_usd;
      }

      // protect_meeting: prefer direct flights, then earlier arrival (more buffer).
      const riskScore = (alt: typeof MOCK_ALTERNATIVES[number]) =>
        alt.connection_risk === 'high' ? 1 : 0;
      const riskDiff = riskScore(a) - riskScore(b);
      if (riskDiff !== 0) return riskDiff;
      return Date.parse(a.arrival) - Date.parse(b.arrival);
    })
    .map((alternative, index) => {
      const bufferMinutes = minutesUntilMeeting(alternative.arrival);
      let reason: string;

      if (priority === 'earliest_arrival') {
        reason = 'Ranked by earliest listed arrival time.';
      } else if (priority === 'lowest_cost') {
        reason = `Ranked by lowest listed synthetic cost (USD ${alternative.synthetic_cost_usd}).`;
      } else {
        // protect_meeting
        if (alternative.flight_id === 'MOCK-ALT-102') {
          reason = `Direct flight with the largest buffer (${bufferMinutes} minutes) before the 19 Oct 09:30 IST meeting.`;
        } else if (alternative.flight_id === 'MOCK-ALT-103') {
          reason = `Direct flight arriving the morning of the meeting, leaving a smaller buffer (${bufferMinutes} minutes).`;
        } else {
          reason = `Arrives earlier but has a fragile connection; connection failure could miss the 19 Oct 09:30 IST meeting.`;
        }
      }

      return {
        rank: index + 1,
        ...alternative,
        meeting_buffer_minutes: bufferMinutes,
        reason
      };
    });

  return ranked;
}

function recommendationReason(
  priority: RecoveryPriority,
  topAlternative: ReturnType<typeof rankAlternatives>[number]
) {
  if (priority === 'earliest_arrival') {
    return 'Earliest listed arrival among the synthetic alternatives for the chosen priority.';
  }
  if (priority === 'lowest_cost') {
    return `Lowest listed synthetic cost (USD ${topAlternative.synthetic_cost_usd}) among the synthetic alternatives for the chosen priority.`;
  }
  return `Direct flight with the largest buffer (${topAlternative.meeting_buffer_minutes} minutes) before the 19 Oct 09:30 IST meeting.`;
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
      'Step 3 in the recovery workflow. Rank synthetic alternative flights by protect_meeting, earliest_arrival, or lowest_cost. Does not check live schedules, availability, or fares.',
    inputSchema: z.object({
      flight_id: z.enum(['DEMO-BLR-DEL-001', 'DEMO-BLR-DEL-002']),
      priority: z
        .enum(['protect_meeting', 'earliest_arrival', 'lowest_cost'])
        .describe(
          'What matters most to the traveller. protect_meeting = prefer direct flights with the largest buffer before the 19 Oct 09:30 IST meeting.'
        )
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'protect_meeting'
      },
      response: {
        data_source: 'mock_fixture',
        notice:
          'Synthetic alternatives only. Flight schedules, seat availability, fares, and rebooking eligibility have not been verified.',
        disrupted_flight_id: 'DEMO-BLR-DEL-001',
        disrupted_flight_status: 'cancelled',
        ranking_priority: 'protect_meeting',
        ranked_alternatives: [
          {
            rank: 1,
            flight_id: 'MOCK-ALT-102',
            route: { origin: 'BLR', destination: 'DEL' },
            departure: '2026-10-18T18:15:00+05:30',
            arrival: '2026-10-18T20:30:00+05:30',
            stops: 0,
            connection_risk: 'low',
            synthetic_cost_usd: 220,
            estimated_delay_minutes: 0,
            meeting_buffer_minutes: 780,
            reason:
              'Direct flight with the largest buffer (780 minutes) before the 19 Oct 09:30 IST meeting.'
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
        .enum(['protect_meeting', 'earliest_arrival', 'lowest_cost'])
        .describe(
          'Traveller priority for ranking alternative flights. protect_meeting = prefer direct flights with the largest buffer before the 19 Oct 09:30 IST meeting.'
        )
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'protect_meeting'
      },
      response: {
        data_source: 'mock_fixture',
        notice:
          'Demonstration plan based entirely on synthetic data. Alternative flights, actual commitments, live availability, fares, rebooking eligibility, and passenger entitlements have not been verified.',
        scenario_time: '2026-10-17T21:00:00+05:30',
        meeting_deadline: '2026-10-19T09:30:00+05:30',
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
          ranking_priority: 'protect_meeting',
          ranked_alternatives: [
            {
              rank: 1,
              flight_id: 'MOCK-ALT-102',
              route: { origin: 'BLR', destination: 'DEL' },
              departure: '2026-10-18T18:15:00+05:30',
              arrival: '2026-10-18T20:30:00+05:30',
              stops: 0,
              connection_risk: 'low',
              synthetic_cost_usd: 220,
              estimated_delay_minutes: 0,
              meeting_buffer_minutes: 780,
              reason:
                'Direct flight with the largest buffer (780 minutes) before the 19 Oct 09:30 IST meeting.'
            }
          ]
        },
        recommendation: {
          recommended_flight_id: 'MOCK-ALT-102',
          reason:
            'Direct flight with the largest buffer (780 minutes) before the 19 Oct 09:30 IST meeting.',
          estimated_departure: '2026-10-18T18:15:00+05:30',
          estimated_arrival: '2026-10-18T20:30:00+05:30'
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
      meeting_deadline: MEETING_DEADLINE,
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
          fixture_scheduled_time: '2026-10-18T22:00:00+05:30',
          buffer_minutes: 0,
          status: 'at_risk',
          reason:
            'Fixture check-in is planned for the rebooking day; confirm availability if arriving late on 18 Oct.'
        },
        {
          commitment: 'Downstream meeting',
          fixture_scheduled_time: MEETING_DEADLINE,
          buffer_minutes: 0,
          status: 'at_risk',
          reason:
            'Fixture meeting at 09:30 IST on 19 Oct is the hard deadline; choose an alternative that arrives with enough buffer.'
        }
      ],
      alternative_options: {
        ranking_priority: input.priority,
        ranked_alternatives: rankedAlternatives
      },
      recommendation: {
        recommended_flight_id: topAlternative.flight_id,
        reason: recommendationReason(input.priority, topAlternative),
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
