import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { CalculatorModule } from './modules/calculator/calculator.module.js';
import { FlightRecoveryModule } from './modules/flight-recovery/flight-recovery.module.js';
import { SystemHealthCheck } from './health/system.health.js';

/**
 * Root Application Module
 * 
 * This is the main module that bootstraps the MCP server.
 * It registers all feature modules and health checks.
 */
@McpApp({
  module: AppModule,
  server: {
    name: 'flight-recovery-mcp',
    version: '1.0.0'
  },
  logging: {
    level: 'info'
  }
})

@McpApp({
  module: AppModule,
  transport: {
    type: 'http',
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
  description: 'Root application module',
  imports: [
    ConfigModule.forRoot(),
    CalculatorModule,
    FlightRecoveryModule
  ],
  providers: [
    // Health Checks
    SystemHealthCheck,
  ]
})
export class AppModule {}

