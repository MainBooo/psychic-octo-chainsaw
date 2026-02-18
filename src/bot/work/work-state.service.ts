// work/work-state.service.ts
import { Injectable } from '@nestjs/common'

@Injectable()
export class WorkStateService {
	private working = false

	isWorking(): boolean {
		return this.working
	}

	setWorking(value: boolean) {
		this.working = value
	}
}
