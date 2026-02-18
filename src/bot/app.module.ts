import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { BotService } from '../bot/bot.service.js'
import { SimTradeModule } from '../sim-trade/sim-trade.module.js'
import { AlorModule } from './alor/alor.module.js'
import { HistoryModule } from './history/history.module.js'
import { InstrumentsModule } from './instruments/instruments.module.js'
import { UserSessionService } from './sessions/user-session.service.js'
import { WorkStateService } from './work/work-state.service.js'
import { HealthController, HealthService } from '../health/health.controller.js'
import { ShutdownService } from '../utils/shutdown.service.js'

@Module({
	imports: [
		AlorModule,
		ScheduleModule.forRoot(),
		InstrumentsModule,
		HistoryModule,
		SimTradeModule,
	],
	controllers: [HealthController],
	providers: [
		BotService,
		UserSessionService,
		WorkStateService,
		HealthService,
		ShutdownService,
	],
})
export class AppModule {}
