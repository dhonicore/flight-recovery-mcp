import {
  ToolDecorator as Tool,
  ExecutionContext,
  z
} from '@nitrostack/core';
import {
  type RecoveryPriority,
  getMockFlights,
  getValidFlightIds,
  getValidAlternateIds,
  getAffectedCommitments,
  rankAlternatives,
  generateDecisionRule,
  getScenarioTime,
  getMeetingDeadline,
  getOriginalPassengerCommitments,
  computeCommitmentStatuses,
  buildRecoveryActions,
  createNotFoundError,
  formatFullTime,
  toDisplay
} from './flight-recovery.domain.js';

const PRIORITY_SCHEMA = z
  .enum(['protect_meeting', 'earliest_arrival', 'lowest_cost'])
  .default('protect_meeting')
  .describe(
    'What matters most to the traveller. protect_meeting = prefer direct flights with the largest buffer before the meeting.'
  );

const SYNTHETIC_NOTICE =
  'Synthetic demo data. No live airline, hotel, calendar or transfer systems were queried. Actions are proposals only.';

const PRESENTATION_NOTE =
  'Present recommended_alternate_id as the final recommendation. Do not re-rank. Mention why the earliest option loses.';

export class FlightRecoveryTools {
  @Tool({
    name: 'assess_disruption',
    description:
      'STEP 1. Returns the status of a flight (cancelled or delayed), cause, and times. Call first when the user reports a disrupted flight.',
    inputSchema: z.object({
      flight_id: z
        .string()
        .describe(
          'Synthetic flight identifier. DEMO-BLR-DEL-001 = cancelled morning flight; DEMO-BLR-DEL-002 = delayed afternoon flight.'
        )
    }),
    examples: {
      request: { flight_id: 'DEMO-BLR-DEL-001' },
      response: {
        data_source: 'mock_fixture',
        notice: SYNTHETIC_NOTICE,
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
    input: { flight_id: string },
    ctx: ExecutionContext
  ) {
    const flights = getMockFlights();
    const flight = flights[input.flight_id];

    if (!flight) {
      return createNotFoundError('flight_id', input.flight_id, getValidFlightIds());
    }

    ctx.logger.info('Assessing synthetic flight disruption', {
      flight_id: input.flight_id,
      status: flight.status
    });

    return {
      data_source: 'mock_fixture',
      notice: SYNTHETIC_NOTICE,
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
      'STEP 2. Checks the traveller\'s commitments (client dinner, hotel late check-in, meeting) against the flight\'s status. Call after assess_disruption.',
    inputSchema: z.object({
      flight_id: z.string().describe('Synthetic flight identifier.')
    }),
    examples: {
      request: { flight_id: 'DEMO-BLR-DEL-001' },
      response: {
        data_source: 'mock_fixture',
        notice: SYNTHETIC_NOTICE,
        flight_id: 'DEMO-BLR-DEL-001',
        flight_status: 'cancelled',
        affected_commitments: [
          {
            commitment: 'Airport transfer',
            impact: 'Original pickup time is tied to the cancelled flight and must be rescheduled.',
            severity: 'high'
          }
        ],
        next_step:
          'Confirm the traveller\'s actual bookings, commitment times, and priorities before making changes.'
      }
    }
  })
  async mapBlastRadius(
    input: { flight_id: string },
    ctx: ExecutionContext
  ) {
    const flights = getMockFlights();
    const flight = flights[input.flight_id];

    if (!flight) {
      return createNotFoundError('flight_id', input.flight_id, getValidFlightIds());
    }

    ctx.logger.info('Mapping synthetic flight disruption impacts', {
      flight_id: input.flight_id,
      status: flight.status
    });

    return {
      data_source: 'mock_fixture',
      notice: SYNTHETIC_NOTICE,
      flight_id: flight.flight_id,
      flight_status: flight.status,
      affected_commitments: getAffectedCommitments(flight.status),
      next_step:
        'Confirm the traveller\'s actual bookings, commitment times, and priorities before making changes.'
    };
  }

  @Tool({
    name: 'rank_alternates',
    description:
      'STEP 3. Ranks three replacement flights, shows what each keeps or loses, and returns one recommended option. Default: protect_meeting. Use earliest_arrival or lowest_cost ONLY if the user explicitly asks for the fastest or cheapest option. Call after map_blast_radius.',
    inputSchema: z.object({
      flight_id: z.string().describe('Synthetic flight identifier.'),
      priority: PRIORITY_SCHEMA
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'protect_meeting'
      },
      response: {
        data_source: 'mock_fixture',
        notice: SYNTHETIC_NOTICE,
        priority_used: 'protect_meeting',
        recommended_alternate_id: 'MOCK-ALT-102',
        decision_rule:
          'Meeting is the priority. MOCK-ALT-101 is earliest but a missed connection costs the 09:30 meeting; MOCK-ALT-102 is nonstop and keeps the downstream meeting and hotel check-in.',
        disrupted_flight_id: 'DEMO-BLR-DEL-001',
        disrupted_flight_status: 'cancelled',
        ranking: [
          {
            rank: 1,
            id: 'MOCK-ALT-102',
            keeps: ['airport_transfer', 'client_dinner', 'hotel_check_in', 'downstream_meeting'],
            at_risk: [],
            loses: [],
            worst_case: null,
            reason:
              'Nonstop flight that keeps the downstream meeting and hotel check-in (780 minutes before the meeting).'
          }
        ],
        presentation_note: PRESENTATION_NOTE
      }
    }
  })
  async rankAlternates(
    input: { flight_id: string; priority: RecoveryPriority },
    ctx: ExecutionContext
  ) {
    const flights = getMockFlights();
    const original = flights[input.flight_id];

    if (!original) {
      return createNotFoundError('flight_id', input.flight_id, getValidFlightIds());
    }

    const ranking = rankAlternatives(input.priority);
    const recommended = ranking[0];

    ctx.logger.info('Ranked synthetic alternative flights', {
      flight_id: input.flight_id,
      priority: input.priority,
      recommended: recommended?.id
    });

    return {
      data_source: 'mock_fixture',
      notice: SYNTHETIC_NOTICE,
      priority_used: input.priority,
      recommended_alternate_id: recommended?.id ?? null,
      decision_rule: generateDecisionRule(input.priority, ranking),
      disrupted_flight_id: original.flight_id,
      disrupted_flight_status: original.status,
      ranking,
      presentation_note: PRESENTATION_NOTE
    };
  }

  @Tool({
    name: 'plan_recovery',
    description:
      'STEP 4. Returns specific ordered proposed actions for the recommended or chosen replacement flight. Default: protect_meeting. Use earliest_arrival or lowest_cost ONLY if the user explicitly asks for the fastest or cheapest option. Proposals only; nothing is executed. Call last.',
    inputSchema: z.object({
      flight_id: z.string().describe('Synthetic flight identifier.'),
      priority: PRIORITY_SCHEMA,
      chosen_alternate_id: z
        .string()
        .optional()
        .describe(
          'Optional alternate to plan for. When omitted, the top-ranked alternate for the priority is used.'
        )
    }),
    examples: {
      request: {
        flight_id: 'DEMO-BLR-DEL-001',
        priority: 'protect_meeting'
      },
      response: {
        data_source: 'mock_fixture',
        notice: SYNTHETIC_NOTICE,
        priority_used: 'protect_meeting',
        recommended_alternate_id: 'MOCK-ALT-102',
        decision_rule:
          'Meeting is the priority. MOCK-ALT-101 is earliest but a missed connection costs the 09:30 meeting; MOCK-ALT-102 is nonstop and keeps the downstream meeting and hotel check-in.',
        ranking: [],
        presentation_note: PRESENTATION_NOTE,
        disruption: {
          flight_id: 'DEMO-BLR-DEL-001',
          route: { origin: 'BLR', destination: 'DEL' },
          status: 'cancelled'
        },
        chosen_alternate_id: 'MOCK-ALT-102',
        recommended_actions: [],
        entitlement_status: 'not_verified'
      }
    }
  })
  async planRecovery(
    input: {
      flight_id: string;
      priority: RecoveryPriority;
      chosen_alternate_id?: string;
    },
    ctx: ExecutionContext
  ) {
    const flights = getMockFlights();
    const flight = flights[input.flight_id];

    if (!flight) {
      return createNotFoundError('flight_id', input.flight_id, getValidFlightIds());
    }

    const ranking = rankAlternatives(input.priority);
    const recommended = ranking[0];
    const chosenId = input.chosen_alternate_id ?? recommended?.id;
    const chosenAlternate = ranking.find((r) => r.id === chosenId);

    if (!chosenAlternate) {
      return createNotFoundError(
        'chosen_alternate_id',
        input.chosen_alternate_id ?? '',
        getValidAlternateIds()
      );
    }

    const warning =
      chosenAlternate.id !== recommended?.id
        ? 'Chosen option differs from the recommended one.'
        : undefined;

    const { statuses } = computeCommitmentStatuses(chosenAlternate);
    const actions = buildRecoveryActions(chosenAlternate, statuses);

    ctx.logger.info('Created synthetic flight recovery plan', {
      flight_id: input.flight_id,
      status: flight.status,
      priority: input.priority,
      recommended: recommended?.id,
      chosen: chosenAlternate.id
    });

    return {
      data_source: 'mock_fixture',
      notice: SYNTHETIC_NOTICE,
      priority_used: input.priority,
      recommended_alternate_id: recommended?.id ?? null,
      decision_rule: generateDecisionRule(input.priority, ranking),
      ranking,
      presentation_note: PRESENTATION_NOTE,
      scenario_time: getScenarioTime(),
      scenario_time_display: toDisplay(getScenarioTime()),
      meeting_deadline: getMeetingDeadline(),
      meeting_deadline_display: toDisplay(getMeetingDeadline()),
      disruption: {
        flight_id: flight.flight_id,
        route: flight.route,
        status: flight.status,
        reported_cause: flight.reported_cause,
        scheduled_departure: flight.scheduled_departure,
        scheduled_departure_display: flight.scheduled_departure_display,
        scheduled_arrival: flight.scheduled_arrival,
        scheduled_arrival_display: flight.scheduled_arrival_display,
        estimated_departure: flight.estimated_departure,
        estimated_departure_display: flight.estimated_departure_display,
        estimated_arrival: flight.estimated_arrival,
        estimated_arrival_display: flight.estimated_arrival_display,
        delay_minutes: flight.delay_minutes
      },
      impact_assessment: {
        affected_commitments: getAffectedCommitments(flight.status),
        notice:
          'Potential impacts only; no actual bookings or commitments have been checked.'
      },
      synthetic_passenger_commitments: getOriginalPassengerCommitments(),
      alternative_options: {
        ranking_priority: input.priority,
        ranked_alternatives: ranking
      },
      chosen_alternate_id: chosenAlternate.id,
      warning,
      recommendation: {
        recommended_flight_id: recommended?.id ?? null,
        reason: generateDecisionRule(input.priority, ranking),
        estimated_departure: chosenAlternate.departure,
        estimated_departure_display: chosenAlternate.departure_display,
        estimated_arrival: chosenAlternate.arrival,
        estimated_arrival_display: chosenAlternate.arrival_display
      },
      recommended_actions: actions,
      entitlement_status: 'not_verified',
      next_step:
        'Verify live information and the traveller\'s actual commitments before making a rebooking decision.'
    };
  }
}
