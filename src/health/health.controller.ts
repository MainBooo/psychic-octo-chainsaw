import { Controller, Get, HttpCode } from '@nestjs/common'
import { Injectable } from '@nestjs/common'

interface HealthStatus {
	status: 'ok' | 'degraded' | 'down'
	timestamp: string
	uptime: number
	version: string
	services: {
		moex: 'ok' | 'down'
		telegram: 'ok' | 'down'
		alor: 'ok' | 'down'
	}
}

@Injectable()
export class HealthService {
	private startTime = Date.now()

	getHealth(): HealthStatus {
		const uptime = Math.floor((Date.now() - this.startTime) / 1000)

		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
			uptime,
			version: process.env.npm_package_version || '2.0.0',
			services: {
				moex: 'ok',
				telegram: 'ok',
				alor: 'ok',
			},
		}
	}

	isHealthy(): boolean {
		return true
	}
}

@Controller()
export class HealthController {
	constructor(private readonly healthService: HealthService) {}

	@Get('health')
	@HttpCode(200)
	health(): HealthStatus {
		return this.healthService.getHealth()
	}

	@Get('ready')
	@HttpCode(200)
	ready(): { ready: boolean } {
		return { ready: this.healthService.isHealthy() }
	}

	@Get('live')
	@HttpCode(200)
	live(): { alive: boolean } {
		return { alive: true }
	}
}
