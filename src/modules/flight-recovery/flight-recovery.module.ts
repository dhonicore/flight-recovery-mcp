import { Module } from '@nitrostack/core';
import { FlightRecoveryTools } from './flight-recovery.tools.js';

@Module({
  name: 'flight-recovery',
  description:
    'Synthetic-data tools for the flight recovery workflow: assess disruption, map blast radius, rank alternatives, and plan recovery.',
  controllers: [FlightRecoveryTools]
})
export class FlightRecoveryModule {}
