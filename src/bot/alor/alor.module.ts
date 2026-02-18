import { Module } from '@nestjs/common'
import { AlorAuthService } from './alor-auth.service.js'
import { AlorService } from './alor.service.js'

@Module({
	providers: [AlorService, AlorAuthService],
	exports: [AlorService, AlorAuthService],
})
export class AlorModule {}
