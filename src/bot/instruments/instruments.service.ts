import { Injectable, Logger } from '@nestjs/common'
import { AlorAuthService } from '../alor/alor-auth.service.js'
import { AlorInstrumentsProvider } from './providers/alor-instruments.provider.js'
import { MoexInstrumentsProvider } from './providers/moex-instruments.provider.js'
import { Instrument } from './types/instrument.type.js'

@Injectable()
export class InstrumentsService {
	private readonly logger = new Logger(InstrumentsService.name)
	private cache: Instrument[] = []
	private loadedAt = 0

	constructor(
		private readonly auth: AlorAuthService,
		private readonly alor: AlorInstrumentsProvider,
		private readonly moex: MoexInstrumentsProvider,
	) {}

	private normalize(symbol: string): string {
		return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
	}

	async load(): Promise<Instrument[]> {
		const now = Date.now()
		this.logger.log(`Loaded instruments count: ${this.cache.length}`)

		if (now - this.loadedAt < 24 * 60 * 60 * 1000 && this.cache.length) {
			return this.cache
		}

		try {
			this.logger.log('Loading instruments from ALOR')
			this.cache = await this.alor.load()
		} catch (e) {
			this.logger.error('ALOR failed, fallback to MOEX')
			this.cache = await this.moex.load()
		}

		this.loadedAt = now
		return this.cache
	}
	async findBySymbol(symbol: string): Promise<Instrument | null> {
		const instruments = await this.load()

		const target = this.normalize(symbol)
		this.logger.error(
			instruments
				.map(i => i.symbol)
				.slice(0, 200)
				.join(', '),
		)

		return (
			instruments.find(i => this.normalize(i.symbol).startsWith(target)) ?? null
		)
	}

	async search(query?: string): Promise<Instrument[]> {
		const instruments = await this.load()
		if (!query) return instruments

		const q = query.toUpperCase()
		return instruments.filter(
			i => i.symbol.includes(q) || i.name.toUpperCase().includes(q),
		)
	}
}
