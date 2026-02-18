import { Module } from '@nestjs/common'
import { UserSessionService } from './user-session.service.js'

@Module({
	providers: [UserSessionService],
	exports: [UserSessionService], // важно, чтобы другие модули могли использовать
})
export class UserSessionModule {}
