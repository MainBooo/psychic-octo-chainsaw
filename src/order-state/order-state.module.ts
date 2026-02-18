import { Module } from '@nestjs/common'
import { OrderStateService } from './order-state.service.js'

@Module({
	providers: [OrderStateService],
	exports: [OrderStateService],
})
export class OrderStateModule {}
