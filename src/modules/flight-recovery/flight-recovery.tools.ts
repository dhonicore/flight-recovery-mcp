
import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';

const MOCK_FLIGHTS = {
  'DEMO-BLR-DEL-001': {
    flight_id: 'DEMO-BLR-DEL-001',
    route: { origin: 'BLR', destination: 'DEL' },
    scheduled_departure: '2026-10-17T06:30:00+05:30',
    scheduled_arrival: '2026-10-17T09:15:00+05:30',
    status: 'cancelled',
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
    status: 'delayed',
    reported_cause: 'weather',
    estimated_departure: '2026-10-17T16:00:00+05:30',
    estimated_arrival: '2026-10-17T18:45:00+05:30',
    delay_minutes: 120
  }
} as const;

export class FlightRecoveryTools {
  @Tool({
    name: 'assess_disruption',
    description:
      'Assess a flight disruption using mock data. Returns flight status, reported cause, timing impact, preliminary guidance, and missing information.',
    inputSchema: z.object({
      flight_id: z
        .enum(['DEMO-BLR-DEL-001', 'DEMO-BLR-DEL-002'])
        .describe('Mock flight identifier. Use DEMO-BLR-DEL-001 for the cancelled-flight demo.')
    }),
    examples: {
      request: { flight_id: 'DEMO-BLR-DEL-001' },
      response: {
        data_source: 'mock_fixture',
        flight_id: 'DEMO-BLR-DEL-001',
        status: 'cancelled',
        reported_cause: 'operational_issue',
        delay_minutes: null,
        preliminary_assessment: {
          potential_next_step: 'Check rebooking options and the applicable policy.',
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
    input: { flight_id: keyof typeof MOCK_FLIGHTS },
    ctx: ExecutionContext
  ) {
    const flight = MOCK_FLIGHTS[input.flight_id];

    ctx.logger.info('Assessing mock flight disruption', {
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
      'Map the downstream commitments potentially affected by a mock flight disruption. Returns synthetic impacts and their severity.',
    inputSchema: z.object({
      flight_id: z
        .enum(['DEMO-BLR-DEL-001', 'DEMO-BLR-DEL-002'])
        .describe('Mock flight identifier.')
    }),
    examples: {
      request: { flight_id: 'DEMO-BLR-DEL-001' },
      response: {
        data_source: 'mock_fixture',
        flight_id: 'DEMO-BLR-DEL-001',
        flight_status: 'cancelled',
        affected_commitments: [
          {
            commitment: 'Airport transfer',
            impact: 'Original pickup time may no longer work',
            severity: 'high'
          }
        ]
      }
    }
  })
  async mapBlastRadius(
    input: { flight_id: keyof typeof MOCK_FLIGHTS },
    ctx: ExecutionContext
  ) {
    const flight = MOCK_FLIGHTS[input.flight_id];

    const affectedCommitments =
      flight.status === 'cancelled'
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

    ctx.logger.info('Mapping mock flight disruption impacts', {
      flight_id: input.flight_id,
      status: flight.status
    });

    return {
      data_source: 'mock_fixture',
      notice:
        'Synthetic potential impacts only. No actual bookings or commitments have been checked.',
      flight_id: flight.flight_id,
      flight_status: flight.status,
      affected_commitments: affectedCommitments,
      next_step:
        'Confirm the traveller’s actual bookings, commitment times, and priorities before making changes.'
    };
  }

  @Tool({
    name: 'rank_alternates',
    description:
      'Rank synthetic alternative flights by earliest arrival or lowest delay. Does not check live schedules, availability, or fares.',
    inputSchema: z.object({
      flight_id: z.enum([
        'DEMO-BLR-DEL-001',
        'DEMO-BLR-DEL-002'
      ]),
      priority: z.enum([
        'earliest_arrival',
        'lowest_delay'
      ]).describe('What matters most to the traveller.')
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'earliest_arrival'
      }
    }
  })
  async rankAlternates(
    input: {
      flight_id: keyof typeof MOCK_FLIGHTS;
      priority: 'earliest_arrival' | 'lowest_delay';
    },
    ctx: ExecutionContext
  ) {
    const original = MOCK_FLIGHTS[input.flight_id];

    const alternatives = [
      {
        flight_id: 'MOCK-ALT-101',
        route: { origin: 'BLR', destination: 'DEL' },
        departure: '2026-10-17T17:00:00+05:30',
        arrival: '2026-10-17T19:45:00+05:30',
        estimated_delay_minutes: 30
      },
      {
        flight_id: 'MOCK-ALT-102',
        route: { origin: 'BLR', destination: 'DEL' },
        departure: '2026-10-17T18:15:00+05:30',
        arrival: '2026-10-17T20:30:00+05:30',
        estimated_delay_minutes: 0
      }
    ];

    const ranked = [...alternatives].sort((a, b) => {
      if (input.priority === 'earliest_arrival') {
        return Date.parse(a.arrival) - Date.parse(b.arrival);
      }

      return (
        a.estimated_delay_minutes - b.estimated_delay_minutes
      );
    });

    ctx.logger.info('Ranked mock alternative flights', {
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
      ranked_alternatives: ranked.map((flight, index) => ({
        rank: index + 1,
        ...flight,
        reason:
          input.priority === 'earliest_arrival'
            ? 'Ranked by earliest listed arrival time.'
            : 'Ranked by lowest listed estimated delay.'
      })),
      next_step:
        'Verify live schedules, seat availability, fare differences, and rebooking conditions before recommending a booking.'
    };
  }


  @Tool({
    name: 'plan_recovery',
    description:
      'Create a consolidated flight recovery plan using synthetic disruption, impact, and alternative-flight data. Does not verify live flight availability, bookings, fares, or entitlements.',
    inputSchema: z.object({
      flight_id: z.enum([
        'DEMO-BLR-DEL-001',
        'DEMO-BLR-DEL-002'
      ]),
      priority: z.enum([
        'earliest_arrival',
        'lowest_delay'
      ]).describe('Traveller priority for ranking alternative flights.')
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'earliest_arrival'
      }
    }
  })
  async planRecovery(
    input: {
      flight_id: keyof typeof MOCK_FLIGHTS;
      priority: 'earliest_arrival' | 'lowest_delay';
    },
    ctx: ExecutionContext
  ) {
    const flight = MOCK_FLIGHTS[input.flight_id];

    const affectedCommitments =
      flight.status === 'cancelled'
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

    const alternatives = [
      {
        flight_id: 'MOCK-ALT-101',
        route: { origin: 'BLR', destination: 'DEL' },
        departure: '2026-10-17T17:00:00+05:30',
        arrival: '2026-10-17T19:45:00+05:30',
        estimated_delay_minutes: 30
      },
      {
        flight_id: 'MOCK-ALT-102',
        route: { origin: 'BLR', destination: 'DEL' },
        departure: '2026-10-17T18:15:00+05:30',
        arrival: '2026-10-17T20:30:00+05:30',
        estimated_delay_minutes: 0
      }
    ];

    const rankedAlternatives = [...alternatives]
      .sort((a, b) =>
        input.priority === 'earliest_arrival'
          ? Date.parse(a.arrival) - Date.parse(b.arrival)
          : a.estimated_delay_minutes - b.estimated_delay_minutes
      )
      .map((alternative, index) => ({
        rank: index + 1,
        ...alternative
      }));

    ctx.logger.info('Created mock flight recovery plan', {
      flight_id: input.flight_id,
      status: flight.status,
      priority: input.priority
    });

    return {
      data_source: 'mock_fixture',
      notice:
        'Demonstration plan based entirely on synthetic data. Alternative flights, actual commitments, live availability, fares, rebooking eligibility, and passenger entitlements have not been verified.',
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
        affected_commitments: affectedCommitments,
        notice:
          'Potential impacts only; no actual bookings or commitments have been checked.'
      },
      alternative_options: {
        ranking_priority: input.priority,
        ranked_alternatives: rankedAlternatives
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
