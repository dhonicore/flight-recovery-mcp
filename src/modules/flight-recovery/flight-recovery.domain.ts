/**
 * Flight Recovery domain model.
 *
 * All fixtures are generated relative to the current IST wall-clock time so the
 * demo never shows stale dates. The three mock sources (airline status +
 * alternates, traveller commitments, transfer buffer) are kept as separate
 * constants/functions in this file; the tools are thin wrappers over them.
 */

export type RecoveryPriority = 'protect_meeting' | 'earliest_arrival' | 'lowest_cost';
export type CommitmentStatus = 'kept' | 'at_risk' | 'missed';
export type FlightStatus = 'cancelled' | 'delayed';
export type CommitmentKey = 'airport_transfer' | 'client_dinner' | 'hotel_check_in' | 'downstream_meeting';

const FLIGHT_OFFSET = 1;
const ALT_101_102_OFFSET = 2;
const ALT_103_MEETING_OFFSET = 3;

const TRANSFER_BUFFER_MIN = 90;
const DINNER_BUFFER_MIN = 60;
const HOTEL_BUFFER_MIN = 60;
const MEETING_BUFFER_MIN = 90;
const FRAGILE_CONNECTION_MAX_MIN = 44;

export type CommitmentOverridesInput = {
  meeting_start?: string;
  dinner_start?: string;
  hotel_checkin_cutoff?: string;
  meeting_prep_min?: number;
};

export type ResolvedCommitments = {
  meeting_start: string;
  meeting_start_display: string;
  dinner_start: string;
  dinner_start_display: string;
  hotel_checkin_cutoff: string;
  hotel_checkin_cutoff_display: string;
  meeting_prep_min: number;
  commitments_source: 'caller_provided' | 'mock_fixture';
};

export type CommitmentResolutionResult =
  | { ok: true; commitments: ResolvedCommitments }
  | { ok: false; error: { error: string; field: string; message: string } };

export function getDefaultCommitments(): ResolvedCommitments {
  return {
    meeting_start: getMeetingDeadline(),
    meeting_start_display: toDisplay(getMeetingDeadline()),
    dinner_start: getDinnerDeadline(),
    dinner_start_display: toDisplay(getDinnerDeadline()),
    hotel_checkin_cutoff: getHotelCheckInDeadline(),
    hotel_checkin_cutoff_display: toDisplay(getHotelCheckInDeadline()),
    meeting_prep_min: MEETING_BUFFER_MIN,
    commitments_source: 'mock_fixture'
  };
}

function validateIsoWithOffset(value: string, field: string): { error: string; field: string; message: string } | null {
  if (typeof value !== 'string') {
    return { error: 'Validation failed.', field, message: 'Expected a string.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value)) {
    return {
      error: 'Validation failed.',
      field,
      message: 'Expected ISO 8601 with explicit offset (e.g. 2026-10-20T09:30:00+05:30).'
    };
  }
  if (Number.isNaN(Date.parse(value))) {
    return { error: 'Validation failed.', field, message: 'Invalid date.' };
  }
  return null;
}

export function resolveCommitments(
  input: CommitmentOverridesInput = {}
): CommitmentResolutionResult {
  const provided = {
    meeting_start: input.meeting_start,
    dinner_start: input.dinner_start,
    hotel_checkin_cutoff: input.hotel_checkin_cutoff,
    meeting_prep_min: input.meeting_prep_min
  };

  const anyProvided =
    provided.meeting_start !== undefined ||
    provided.dinner_start !== undefined ||
    provided.hotel_checkin_cutoff !== undefined ||
    provided.meeting_prep_min !== undefined;

  if (!anyProvided) {
    return {
      ok: true,
      commitments: {
        meeting_start: getMeetingDeadline(),
        meeting_start_display: toDisplay(getMeetingDeadline()),
        dinner_start: getDinnerDeadline(),
        dinner_start_display: toDisplay(getDinnerDeadline()),
        hotel_checkin_cutoff: getHotelCheckInDeadline(),
        hotel_checkin_cutoff_display: toDisplay(getHotelCheckInDeadline()),
        meeting_prep_min: MEETING_BUFFER_MIN,
        commitments_source: 'mock_fixture'
      }
    };
  }

  if (provided.meeting_prep_min !== undefined) {
    if (
      typeof provided.meeting_prep_min !== 'number' ||
      !Number.isFinite(provided.meeting_prep_min) ||
      provided.meeting_prep_min < 0 ||
      provided.meeting_prep_min % 1 !== 0
    ) {
      return {
        ok: false,
        error: {
          error: 'Validation failed.',
          field: 'meeting_prep_min',
          message: 'Expected a non-negative integer number of minutes.'
        }
      };
    }
  }

  const isoFields: Array<{ key: 'meeting_start' | 'dinner_start' | 'hotel_checkin_cutoff'; label: string }> = [
    { key: 'meeting_start', label: 'meeting_start' },
    { key: 'dinner_start', label: 'dinner_start' },
    { key: 'hotel_checkin_cutoff', label: 'hotel_checkin_cutoff' }
  ];

  for (const { key, label } of isoFields) {
    const value = provided[key];
    if (value === undefined) continue;
    const err = validateIsoWithOffset(value, label);
    if (err) return { ok: false, error: err };
  }

  return {
    ok: true,
    commitments: {
      meeting_start: provided.meeting_start ?? getMeetingDeadline(),
      meeting_start_display: toDisplay(provided.meeting_start ?? getMeetingDeadline()),
      dinner_start: provided.dinner_start ?? getDinnerDeadline(),
      dinner_start_display: toDisplay(provided.dinner_start ?? getDinnerDeadline()),
      hotel_checkin_cutoff: provided.hotel_checkin_cutoff ?? getHotelCheckInDeadline(),
      hotel_checkin_cutoff_display: toDisplay(provided.hotel_checkin_cutoff ?? getHotelCheckInDeadline()),
      meeting_prep_min: provided.meeting_prep_min ?? MEETING_BUFFER_MIN,
      commitments_source: 'caller_provided'
    }
  };
}

export function createValidationError(field: string, message: string) {
  return { error: 'Validation failed.', field, message };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Format a UTC instant as an ISO 8601 string showing the equivalent
 * India wall-clock time with explicit +05:30 offset.
 */
function toISTOffset(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600e3);
  const year = ist.getUTCFullYear();
  const month = pad2(ist.getUTCMonth() + 1);
  const day = pad2(ist.getUTCDate());
  const hour = pad2(ist.getUTCHours());
  const minute = pad2(ist.getUTCMinutes());
  const second = pad2(ist.getUTCSeconds());
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`;
}

/**
 * Build an ISO 8601 timestamp with explicit +05:30 offset for a given IST
 * offset-date and wall-clock time.
 * @param offset days from today (IST)
 * @param hhmm   "HH:MM" IST
 */
export function at(offset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.now() + 5.5 * 3600e3);
  return toISTOffset(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset, h - 5, m - 30))
  );
}

export function getScenarioTime(): string {
  return toISTOffset(new Date());
}

export function toDisplay(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' });
  const month = d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' });
  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata'
  });
  return `${weekday} ${day} ${month}, ${time} IST`;
}

export function getMeetingDeadline(): string {
  return at(ALT_103_MEETING_OFFSET, '09:30');
}

export function getHotelCheckInDeadline(): string {
  return at(ALT_101_102_OFFSET, '22:00');
}

export function getDinnerDeadline(): string {
  return at(ALT_101_102_OFFSET, '21:00');
}

export function getOriginalTransferPickupTime(): string {
  return at(FLIGHT_OFFSET, '09:45');
}

export type MockFlight = {
  flight_id: string;
  route: { origin: string; destination: string };
  scheduled_departure: string;
  scheduled_departure_display: string;
  scheduled_arrival: string;
  scheduled_arrival_display: string;
  status: FlightStatus;
  reported_cause: string;
  estimated_departure: string | null;
  estimated_departure_display: string | null;
  estimated_arrival: string | null;
  estimated_arrival_display: string | null;
  delay_minutes: number | null;
};

export function getMockFlights(): Record<string, MockFlight> {
  return {
    'DEMO-BLR-DEL-001': {
      flight_id: 'DEMO-BLR-DEL-001',
      route: { origin: 'BLR', destination: 'DEL' },
      scheduled_departure: at(FLIGHT_OFFSET, '06:30'),
      scheduled_departure_display: toDisplay(at(FLIGHT_OFFSET, '06:30')),
      scheduled_arrival: at(FLIGHT_OFFSET, '09:15'),
      scheduled_arrival_display: toDisplay(at(FLIGHT_OFFSET, '09:15')),
      status: 'cancelled',
      reported_cause: 'operational_issue',
      estimated_departure: null,
      estimated_departure_display: null,
      estimated_arrival: null,
      estimated_arrival_display: null,
      delay_minutes: null
    },
    'DEMO-BLR-DEL-002': {
      flight_id: 'DEMO-BLR-DEL-002',
      route: { origin: 'BLR', destination: 'DEL' },
      scheduled_departure: at(FLIGHT_OFFSET, '14:00'),
      scheduled_departure_display: toDisplay(at(FLIGHT_OFFSET, '14:00')),
      scheduled_arrival: at(FLIGHT_OFFSET, '16:45'),
      scheduled_arrival_display: toDisplay(at(FLIGHT_OFFSET, '16:45')),
      status: 'delayed',
      reported_cause: 'weather',
      estimated_departure: at(FLIGHT_OFFSET, '16:00'),
      estimated_departure_display: toDisplay(at(FLIGHT_OFFSET, '16:00')),
      estimated_arrival: at(FLIGHT_OFFSET, '18:45'),
      estimated_arrival_display: toDisplay(at(FLIGHT_OFFSET, '18:45')),
      delay_minutes: 120
    }
  };
}

export type Alternate = {
  flight_id: string;
  route: { origin: string; destination: string };
  departure: string;
  departure_display: string;
  arrival: string;
  arrival_display: string;
  stops: number;
  connection_risk: 'high' | 'low';
  connection_buffer_min: number;
  worst_case_arrival: string | null;
  worst_case_arrival_display: string | null;
  synthetic_cost_usd: number;
  estimated_delay_minutes: number;
};

export function getMockAlternatives(): Alternate[] {
  return [
    {
      flight_id: 'MOCK-ALT-101',
      route: { origin: 'BLR', destination: 'DEL' },
      departure: at(ALT_101_102_OFFSET, '14:00'),
      departure_display: toDisplay(at(ALT_101_102_OFFSET, '14:00')),
      arrival: at(ALT_101_102_OFFSET, '18:30'),
      arrival_display: toDisplay(at(ALT_101_102_OFFSET, '18:30')),
      stops: 1,
      connection_risk: 'high',
      connection_buffer_min: 30,
      worst_case_arrival: at(ALT_103_MEETING_OFFSET, '11:20'),
      worst_case_arrival_display: toDisplay(at(ALT_103_MEETING_OFFSET, '11:20')),
      synthetic_cost_usd: 180,
      estimated_delay_minutes: 0
    },
    {
      flight_id: 'MOCK-ALT-102',
      route: { origin: 'BLR', destination: 'DEL' },
      departure: at(ALT_101_102_OFFSET, '18:15'),
      departure_display: toDisplay(at(ALT_101_102_OFFSET, '18:15')),
      arrival: at(ALT_101_102_OFFSET, '20:30'),
      arrival_display: toDisplay(at(ALT_101_102_OFFSET, '20:30')),
      stops: 0,
      connection_risk: 'low',
      connection_buffer_min: 0,
      worst_case_arrival: null,
      worst_case_arrival_display: null,
      synthetic_cost_usd: 220,
      estimated_delay_minutes: 0
    },
    {
      flight_id: 'MOCK-ALT-103',
      route: { origin: 'BLR', destination: 'DEL' },
      departure: at(ALT_101_102_OFFSET, '23:30'),
      departure_display: toDisplay(at(ALT_101_102_OFFSET, '23:30')),
      arrival: at(ALT_103_MEETING_OFFSET, '07:00'),
      arrival_display: toDisplay(at(ALT_103_MEETING_OFFSET, '07:00')),
      stops: 0,
      connection_risk: 'low',
      connection_buffer_min: 0,
      worst_case_arrival: null,
      worst_case_arrival_display: null,
      synthetic_cost_usd: 95,
      estimated_delay_minutes: 0
    }
  ];
}

export function getValidFlightIds(): string[] {
  return Object.keys(getMockFlights());
}

export function getValidAlternateIds(): string[] {
  return getMockAlternatives().map((a) => a.flight_id);
}

export function getAffectedCommitments(
  status: FlightStatus,
  commitments: ResolvedCommitments = getDefaultCommitments()
) {
  return status === 'cancelled'
    ? [
        {
          commitment: 'Airport transfer',
          impact: 'Original pickup time is tied to the cancelled flight and must be rescheduled.',
          severity: 'high'
        },
        {
          commitment: 'Client dinner',
          impact: 'Arrival time may affect the planned dinner reservation.',
          severity: 'high'
        },
        {
          commitment: 'Hotel check-in',
          impact: 'Arrival may move beyond the planned late check-in time.',
          severity: 'high'
        },
        {
          commitment: 'Downstream meeting',
          impact: `The planned arrival may no longer allow enough time before the meeting at ${formatShortTime(commitments.meeting_start)}.`,
          severity: 'high'
        }
      ]
    : [
        {
          commitment: 'Airport transfer',
          impact: 'Pickup may need to move to match the revised arrival.',
          severity: 'medium'
        },
        {
          commitment: 'Client dinner',
          impact: 'The later arrival may affect the planned dinner reservation.',
          severity: 'medium'
        },
        {
          commitment: 'Hotel check-in',
          impact: 'The later arrival may affect the planned check-in.',
          severity: 'medium'
        },
        {
          commitment: 'Downstream meeting',
          impact: `The delay may reduce the buffer before the meeting at ${formatShortTime(commitments.meeting_start)}.`,
          severity: 'high'
        }
      ];
}

export function getOriginalPassengerCommitments(
  commitments: ResolvedCommitments = getDefaultCommitments()
) {
  return [
    {
      commitment: 'Airport transfer',
      fixture_scheduled_time: getOriginalTransferPickupTime(),
      fixture_scheduled_time_display: toDisplay(getOriginalTransferPickupTime()),
      buffer_minutes: 30,
      status: 'at_risk' as CommitmentStatus,
      reason:
        'Original pickup is tied to the disrupted flight; reschedule after rebooking.'
    },
    {
      commitment: 'Client dinner',
      fixture_scheduled_time: commitments.dinner_start,
      fixture_scheduled_time_display: commitments.dinner_start_display,
      buffer_minutes: 0,
      status: 'at_risk' as CommitmentStatus,
      reason: 'Confirm whether the dinner reservation can be kept after rebooking.'
    },
    {
      commitment: 'Hotel check-in',
      fixture_scheduled_time: commitments.hotel_checkin_cutoff,
      fixture_scheduled_time_display: commitments.hotel_checkin_cutoff_display,
      buffer_minutes: 0,
      status: 'at_risk' as CommitmentStatus,
      reason: 'Confirm availability if arriving late on the rebooking day.'
    },
    {
      commitment: 'Downstream meeting',
      fixture_scheduled_time: commitments.meeting_start,
      fixture_scheduled_time_display: commitments.meeting_start_display,
      buffer_minutes: 0,
      status: 'at_risk' as CommitmentStatus,
      reason: `The meeting at ${formatShortTime(commitments.meeting_start)} is the hard deadline; choose an alternative that arrives with enough buffer.`
    }
  ];
}

type CommitmentDefinition = {
  key: CommitmentKey;
  deadline: string;
  requiredBuffer: number;
  displayName: string;
};

function getCommitmentDefinitions(
  commitments: ResolvedCommitments
): CommitmentDefinition[] {
  return [
    {
      key: 'client_dinner',
      deadline: commitments.dinner_start,
      requiredBuffer: DINNER_BUFFER_MIN,
      displayName: 'client dinner'
    },
    {
      key: 'hotel_check_in',
      deadline: commitments.hotel_checkin_cutoff,
      requiredBuffer: HOTEL_BUFFER_MIN,
      displayName: 'hotel check-in'
    },
    {
      key: 'downstream_meeting',
      deadline: commitments.meeting_start,
      requiredBuffer: commitments.meeting_prep_min,
      displayName: 'downstream meeting'
    }
  ];
}

export type CommitmentStatuses = Record<CommitmentKey, CommitmentStatus>;

export function computeCommitmentStatuses(
  alternate: Alternate,
  commitments: ResolvedCommitments = getDefaultCommitments()
): {
  statuses: CommitmentStatuses;
  details: Record<CommitmentKey, { buffer_minutes: number; reason: string }>;
} {
  const statuses = {} as CommitmentStatuses;
  const details = {} as Record<CommitmentKey, { buffer_minutes: number; reason: string }>;
  const arrival = Date.parse(alternate.arrival);
  const isFragile =
    alternate.connection_buffer_min > 0 &&
    alternate.connection_buffer_min <= FRAGILE_CONNECTION_MAX_MIN;

  for (const def of getCommitmentDefinitions(commitments)) {
    const deadline = Date.parse(def.deadline);
    const bufferMinutes = Math.round((deadline - arrival) / 60_000);
    let rawStatus: CommitmentStatus;
    let reason: string;

    if (bufferMinutes >= def.requiredBuffer) {
      rawStatus = 'kept';
      reason = `Arrives ${Math.abs(bufferMinutes)} minutes before the ${def.displayName}.`;
    } else if (bufferMinutes >= 0) {
      rawStatus = 'at_risk';
      reason = `Arrives only ${bufferMinutes} minutes before the ${def.displayName}; tight buffer.`;
    } else {
      rawStatus = 'missed';
      reason = `Arrives ${Math.abs(bufferMinutes)} minutes after the ${def.displayName}.`;
    }

    if (isFragile && rawStatus === 'kept') {
      statuses[def.key] = 'at_risk';
      reason = `Connection buffer is only ${alternate.connection_buffer_min} minutes; a missed connection puts the ${def.displayName} at risk.`;
    } else {
      statuses[def.key] = rawStatus;
    }

    details[def.key] = { buffer_minutes: bufferMinutes, reason };
  }

  // Airport transfer is always reschedulable; mark based on whether the
  // alternate is in the future.
  statuses.airport_transfer = arrival > Date.now() ? 'kept' : 'at_risk';
  details.airport_transfer = {
    buffer_minutes: Math.round((arrival - Date.now()) / 60_000),
    reason: 'Pickup can be moved to the new arrival time.'
  };

  return { statuses, details };
}

export function buildWorstCaseMessage(
  alternate: Alternate,
  statuses: CommitmentStatuses,
  commitments: ResolvedCommitments = getDefaultCommitments()
): string | null {
  if (!alternate.worst_case_arrival) return null;
  const missed: string[] = [];
  const arrival = Date.parse(alternate.worst_case_arrival);

  for (const def of getCommitmentDefinitions(commitments)) {
    const deadline = Date.parse(def.deadline);
    if (arrival > deadline) {
      missed.push(def.displayName);
    }
  }

  if (missed.length === 0) return null;

  return `If the connection is missed, arrives ${formatShortTime(
    alternate.worst_case_arrival
  )}; ${missed.join(' and ')} ${missed.length === 1 ? 'is' : 'are'} missed.`;
}

export type RankedAlternate = {
  rank: number;
  id: string;
  flight_id: string;
  route: { origin: string; destination: string };
  departure: string;
  departure_display: string;
  arrival: string;
  arrival_display: string;
  stops: number;
  connection_risk: 'high' | 'low';
  connection_buffer_min: number;
  worst_case_arrival: string | null;
  worst_case_arrival_display: string | null;
  synthetic_cost_usd: number;
  estimated_delay_minutes: number;
  meeting_buffer_minutes: number;
  keeps: CommitmentKey[];
  at_risk: CommitmentKey[];
  loses: CommitmentKey[];
  worst_case: string | null;
  reason: string;
};

function statusOrder(status: CommitmentStatus): number {
  return status === 'kept' ? 0 : status === 'at_risk' ? 1 : 2;
}

export function rankAlternatives(
  priority: RecoveryPriority,
  commitments: ResolvedCommitments = getDefaultCommitments()
): RankedAlternate[] {
  const meetingDeadline = commitments.meeting_start;
  const alts = getMockAlternatives();

  const scored = alts.map((alt) => {
    const { statuses } = computeCommitmentStatuses(alt, commitments);
    const meetingBuffer = Math.round((Date.parse(meetingDeadline) - Date.parse(alt.arrival)) / 60_000);
    const worstCase = buildWorstCaseMessage(alt, statuses, commitments);

    const keeps = (Object.keys(statuses) as CommitmentKey[]).filter(
      (k) => statuses[k] === 'kept'
    );
    const atRisk = (Object.keys(statuses) as CommitmentKey[]).filter(
      (k) => statuses[k] === 'at_risk'
    );
    const loses = (Object.keys(statuses) as CommitmentKey[]).filter(
      (k) => statuses[k] === 'missed'
    );

    return {
      alt,
      statuses,
      meetingBuffer,
      worstCase,
      keeps,
      atRisk,
      loses
    };
  });

  const sorted = scored
    .sort((a, b) => {
      if (priority === 'earliest_arrival') {
        return Date.parse(a.alt.arrival) - Date.parse(b.alt.arrival);
      }

      if (priority === 'lowest_cost') {
        return a.alt.synthetic_cost_usd - b.alt.synthetic_cost_usd;
      }

      // protect_meeting
      const meetingA = statusOrder(a.statuses.downstream_meeting);
      const meetingB = statusOrder(b.statuses.downstream_meeting);
      if (meetingA !== meetingB) return meetingA - meetingB;

      const bufferDiff = b.meetingBuffer - a.meetingBuffer;
      if (bufferDiff !== 0) return bufferDiff;

      const riskDiff = (a.alt.connection_risk === 'high' ? 1 : 0) - (b.alt.connection_risk === 'high' ? 1 : 0);
      if (riskDiff !== 0) return riskDiff;

      return Date.parse(a.alt.arrival) - Date.parse(b.alt.arrival);
    })
    .map((item, index): RankedAlternate => {
      const alt = item.alt;
      const bufferMinutes = item.meetingBuffer;
      let reason: string;

      if (priority === 'earliest_arrival') {
        reason = 'Earliest listed arrival time.';
      } else if (priority === 'lowest_cost') {
        reason = `Lowest listed synthetic cost (USD ${alt.synthetic_cost_usd}).`;
      } else {
        // protect_meeting
        if (item.statuses.downstream_meeting === 'kept' && alt.connection_risk === 'low') {
          reason = `Nonstop flight that keeps the downstream meeting${
            item.keeps.includes('hotel_check_in') ? ' and hotel check-in' : ''
          } (${bufferMinutes} minutes before the meeting).`;
        } else if (item.worstCase) {
          reason = `Arrives earlier, but the ${alt.connection_buffer_min}-minute connection puts commitments at risk.`;
        } else if (item.statuses.downstream_meeting === 'at_risk') {
          reason = `Keeps some commitments but leaves the downstream meeting at risk.`;
        } else {
          reason = `Direct option ranked by meeting buffer (${bufferMinutes} minutes).`;
        }
      }

      return {
        rank: index + 1,
        id: alt.flight_id,
        flight_id: alt.flight_id,
        route: alt.route,
        departure: alt.departure,
        departure_display: alt.departure_display,
        arrival: alt.arrival,
        arrival_display: alt.arrival_display,
        stops: alt.stops,
        connection_risk: alt.connection_risk,
        connection_buffer_min: alt.connection_buffer_min,
        worst_case_arrival: alt.worst_case_arrival,
        worst_case_arrival_display: alt.worst_case_arrival_display,
        synthetic_cost_usd: alt.synthetic_cost_usd,
        estimated_delay_minutes: alt.estimated_delay_minutes,
        meeting_buffer_minutes: bufferMinutes,
        keeps: item.keeps,
        at_risk: item.atRisk,
        loses: item.loses,
        worst_case: item.worstCase,
        reason
      };
    });

  return sorted;
}

export function generateDecisionRule(
  priority: RecoveryPriority,
  ranking: RankedAlternate[],
  commitments: ResolvedCommitments = getDefaultCommitments()
): string {
  const top = ranking[0];
  if (!top) return 'No alternatives available.';

  if (priority === 'earliest_arrival') {
    return `${top.id} has the earliest listed arrival.`;
  }

  if (priority === 'lowest_cost') {
    return `${top.id} has the lowest listed synthetic cost (USD ${top.synthetic_cost_usd}).`;
  }

  // protect_meeting
  const fragile = ranking.find(
    (r) => r.connection_buffer_min > 0 && r.connection_buffer_min <= FRAGILE_CONNECTION_MAX_MIN
  );
  const meaningfulKeeps = top.keeps.filter(
    (k) => k === 'client_dinner' || k === 'hotel_check_in' || k === 'downstream_meeting'
  );
  const topKeeps = meaningfulKeeps.length
    ? meaningfulKeeps
        .map((k) =>
          k === 'hotel_check_in'
            ? 'hotel check-in'
            : k === 'downstream_meeting'
            ? 'downstream meeting'
            : k === 'client_dinner'
            ? 'client dinner'
            : k
        )
        .join(' and ')
    : '';

  if (fragile && fragile.id !== top.id) {
    return `Meeting is the priority. ${fragile.id} is earliest but a missed connection costs the ${formatShortTime(
      commitments.meeting_start
    )} meeting; ${top.id} is nonstop and keeps${topKeeps ? ' the ' + topKeeps : ' the meeting'}.`;
  }

  return `Meeting is the priority. ${top.id} keeps${
    topKeeps ? ' the ' + topKeeps : ' the downstream meeting'
  } with the largest buffer.`;
}

export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata'
  });
}

export function formatFullTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata'
  });
}

export type RecoveryAction = {
  action: string;
  requires_user_approval: boolean;
  executed: boolean;
};

export function buildRecoveryActions(
  alternate: Alternate,
  statuses: CommitmentStatuses,
  commitments: ResolvedCommitments = getDefaultCommitments()
): RecoveryAction[] {
  const actions: RecoveryAction[] = [];

  actions.push({
    action: `Request rebooking onto ${alternate.flight_id} (departs ${formatFullTime(
      alternate.departure
    )}, arrives ${formatFullTime(alternate.arrival)}).`,
    requires_user_approval: true,
    executed: false
  });

  actions.push({
    action: `Move airport pickup to ${formatFullTime(alternate.arrival)} at DEL.`,
    requires_user_approval: true,
    executed: false
  });

  if (statuses.client_dinner === 'missed') {
    actions.push({
      action: `Notify the client that dinner will be missed due to the late arrival; propose a reschedule or breakfast alternative.`,
      requires_user_approval: true,
      executed: false
    });
  } else if (statuses.client_dinner === 'at_risk') {
    actions.push({
      action: `Ask the client to push dinner later than ${formatFullTime(
        commitments.dinner_start
      )} because arrival is tight.`,
      requires_user_approval: true,
      executed: false
    });
  } else {
    actions.push({
      action: `Confirm the client dinner reservation is still feasible after arrival.`,
      requires_user_approval: true,
      executed: false
    });
  }

  if (statuses.hotel_check_in === 'kept') {
    actions.push({
      action: `Ask the hotel to hold the room for late check-in (arrival ${formatFullTime(
        alternate.arrival
      )}).`,
      requires_user_approval: true,
      executed: false
    });
  } else {
    actions.push({
      action: `Ask the hotel about a no-show waiver or late check-in policy for the missed check-in window.`,
      requires_user_approval: true,
      executed: false
    });
  }

  if (statuses.downstream_meeting === 'kept') {
    actions.push({
      action: `Confirm the downstream meeting at ${formatFullTime(
        commitments.meeting_start
      )} is feasible.`,
      requires_user_approval: true,
      executed: false
    });
  } else {
    actions.push({
      action: `Ask the meeting organizer to shift the meeting or join remotely, because arrival may miss the ${formatFullTime(
        commitments.meeting_start
      )} start.`,
      requires_user_approval: true,
      executed: false
    });
  }

  if (
    alternate.connection_buffer_min > 0 &&
    alternate.connection_buffer_min <= FRAGILE_CONNECTION_MAX_MIN
  ) {
    actions.push({
      action: `Add a protected-rebooking request with the airline in case the ${alternate.connection_buffer_min}-minute connection is missed.`,
      requires_user_approval: true,
      executed: false
    });
  }

  return actions;
}

export type DraftMessage = {
  to_role: string;
  subject: string;
  body: string;
  status: 'draft_not_sent';
};

export function buildDraftMessages(
  alternate: Alternate,
  statuses: CommitmentStatuses,
  commitments: ResolvedCommitments = getDefaultCommitments()
): {
  client_message: DraftMessage;
  hotel_message: DraftMessage;
  meeting_organizer_message?: DraftMessage;
} {
  const arrivalDisplay = alternate.arrival_display;
  const flightRef = alternate.flight_id;

  const clientMessage: DraftMessage = (() => {
    if (statuses.client_dinner === 'missed') {
      return {
        to_role: 'client',
        subject: `Dinner reschedule needed - arriving ${arrivalDisplay}`,
        body:
          `Hi, my flight has been cancelled and the best rebooking option lands at ${arrivalDisplay} on ${flightRef}, ` +
          `which is after dinner. Can we move dinner to another time, or plan a breakfast instead?`,
        status: 'draft_not_sent'
      };
    }
    if (statuses.client_dinner === 'at_risk') {
      return {
        to_role: 'client',
        subject: `Dinner may need to move - arriving ${arrivalDisplay}`,
        body:
          `Hi, my rebooking lands at ${arrivalDisplay} on ${flightRef}, which makes our current dinner time tight. ` +
          `Can we push it later?`,
        status: 'draft_not_sent'
      };
    }
    return {
      to_role: 'client',
      subject: `Dinner still feasible - arriving ${arrivalDisplay}`,
      body:
        `Hi, my rebooking lands at ${arrivalDisplay} on ${flightRef}. I should still make dinner; confirming we are on.`,
      status: 'draft_not_sent'
    };
  })();

  const hotelMessage: DraftMessage = (() => {
    if (statuses.hotel_check_in === 'missed') {
      return {
        to_role: 'hotel',
        subject: `Late check-in request - arrival ${arrivalDisplay}`,
        body:
          `Hello, my flight was cancelled and my new arrival is ${arrivalDisplay} on ${flightRef}, ` +
          `after your check-in cutoff. Can you hold the room or advise on late check-in / no-show policy?`,
        status: 'draft_not_sent'
      };
    }
    return {
      to_role: 'hotel',
      subject: `Hold room for late check-in - arrival ${arrivalDisplay}`,
      body:
        `Hello, my rebooking lands at ${arrivalDisplay} on ${flightRef}. Please hold my room for a late check-in.`,
      status: 'draft_not_sent'
    };
  })();

  const result: {
    client_message: DraftMessage;
    hotel_message: DraftMessage;
    meeting_organizer_message?: DraftMessage;
  } = {
    client_message: clientMessage,
    hotel_message: hotelMessage
  };

  if (statuses.downstream_meeting === 'at_risk' || statuses.downstream_meeting === 'missed') {
    const meetingDisplay = commitments.meeting_start_display;
    result.meeting_organizer_message = {
      to_role: 'meeting_organizer',
      subject:
        statuses.downstream_meeting === 'missed'
          ? `Cannot make ${meetingDisplay} meeting - flight disruption`
          : `Possible delay for ${meetingDisplay} meeting - flight disruption`,
      body:
        statuses.downstream_meeting === 'missed'
          ? `Hi, my cancelled flight's best rebooking lands at ${arrivalDisplay} on ${flightRef}, ` +
            `which misses our ${meetingDisplay} meeting. Can we reschedule or set up a remote option?`
          : `Hi, my rebooking lands at ${arrivalDisplay} on ${flightRef}, putting the ${meetingDisplay} meeting at risk. ` +
            `Can we shift the time or plan a remote join?`,
      status: 'draft_not_sent'
    };
  }

  return result;
}

export function createNotFoundError(
  field: string,
  received: string,
  validIds: string[]
): { error: string; field: string; received: string; valid_ids: string[] } {
  return {
    error: `Unknown ${field}.`,
    field,
    received,
    valid_ids: validIds
  };
}
