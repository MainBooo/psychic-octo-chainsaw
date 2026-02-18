// work-state.module.ts
import { Module } from '@nestjs/common'
import { WorkStateService } from './work-state.service.js'

@Module({
	providers: [WorkStateService],
	exports: [WorkStateService], // <-- обязательно экспортируем
})
export class WorkStateModule {}
