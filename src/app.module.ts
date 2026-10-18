
import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { FlightRecoveryModule } from './modules/flight-recovery/flight-recovery.module.js';
import { SystemHealthCheck } from './health/system.health.js';

@McpApp({
  module: AppModule,
  transport: {
    type: 'dual',
    http: {
      host: '0.0.0.0',
      port: Number(process.env.PORT || 3000),
    },
  },
  server: {
    name: 'flight-recovery-mcp',
    version: '1.0.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'app',
  description: 'Flight Recovery MCP application',
  imports: [
    ConfigModule.forRoot(),
    FlightRecoveryModule,
  ],
  providers: [
    SystemHealthCheck,
  ],
})
export class AppModule {}
