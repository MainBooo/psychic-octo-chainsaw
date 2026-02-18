import { Module } from '@nestjs/common'
import { AlorModule } from '../alor/alor.module.js'
import { InstrumentsController } from './instruments.controller.js'
import { InstrumentsService } from './instruments.service.js'
import { AlorInstrumentsProvider } from './providers/alor-instruments.provider.js'
import { MoexInstrumentsProvider } from './providers/moex-instruments.provider.js'

@Module({
	controllers: [InstrumentsController],
	imports: [AlorModule],
	providers: [
		InstrumentsService,
		AlorInstrumentsProvider,
		MoexInstrumentsProvider,
	],
	exports: [InstrumentsService],
})
export class InstrumentsModule {}
