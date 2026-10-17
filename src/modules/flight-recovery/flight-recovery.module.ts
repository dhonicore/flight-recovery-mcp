import { Module } from '@nitrostack/core';
import { FlightRecoveryTools } from './flight-recovery.tools.js';

@Module({
  name: 'flight-recovery',
  description: 'Mock-data tools for recovering from flight disruptions',
  controllers: [FlightRecoveryTools]
})
export class FlightRecoveryModule {}
