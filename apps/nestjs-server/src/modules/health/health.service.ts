import { Injectable } from "@nestjs/common";
import { type AppDatabase, InjectDatabase } from "#src/db/database.provider.js";
import type { HealthResponseDto, ReadinessResponseDto } from "./health.dto.js";

@Injectable()
export class HealthService {
	constructor(
		@InjectDatabase()
		private readonly _database: AppDatabase,
	) {}

	/** Returns the public liveness payload used by clients and local tooling. */
	health(): HealthResponseDto {
		return { service: "interview-api", status: "ok" };
	}

	/** Confirms the API and its required PostgreSQL dependency are ready. */
	async readiness(): Promise<ReadinessResponseDto> {
		await this._database.$client.query("select 1");
		return {
			service: "interview-api",
			status: "ok",
			dependencies: { database: "ok" },
		};
	}
}
