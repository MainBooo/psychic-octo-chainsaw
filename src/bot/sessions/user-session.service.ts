// sessions/user-session.service.ts
import { Injectable } from '@nestjs/common'
import { UserState } from '../enums/user-state.enum.js'

type Session = {
	state: UserState
	temp?: Record<string, any>
}

@Injectable()
export class UserSessionService {
	private sessions = new Map<number, Session>()

	get(userId: number): Session {
		if (!this.sessions.has(userId)) {
			this.sessions.set(userId, { state: UserState.IDLE })
		}
		return this.sessions.get(userId)!
	}

	set(userId: number, state: UserState, temp?: any) {
		this.sessions.set(userId, { state, temp })
	}

	reset(userId: number) {
		this.sessions.set(userId, { state: UserState.IDLE })
	}

	setAll(state: UserState) {
		for (const [id] of this.sessions) {
			this.sessions.set(id, { state })
		}
	}

	resetAll() {
		for (const [id] of this.sessions) {
			this.sessions.set(id, { state: UserState.IDLE })
		}
	}
}
