import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { AlorModule } from '../bot/alor/alor.module.js'
import { SimTradeService } from './sim-trade.service.js'

@Module({
	imports: [ScheduleModule.forRoot(), AlorModule],
	providers: [SimTradeService],
	exports: [SimTradeService],
})
export class SimTradeModule {}
