import { Controller, Get, Param, Query } from '@nestjs/common'
import { InstrumentsService } from './instruments.service.js'

@Controller('instruments')
export class InstrumentsController {
	constructor(private readonly instrumentsService: InstrumentsService) {}

	/**
	 * Поиск инструментов
	 * GET /instruments?query=SBER
	 */
	@Get()
	async search(@Query('query') query?: string) {
		return this.instrumentsService.search(query)
	}

	/**
	 * Получение одного инструмента по символу
	 * GET /instruments/SBER
	 */
	@Get(':symbol')
	async getOne(@Param('symbol') symbol: string) {
		return this.instrumentsService.findBySymbol(symbol)
	}
}
