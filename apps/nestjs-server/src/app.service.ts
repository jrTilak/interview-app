import { Injectable } from "@nestjs/common";
import { type AppDatabase, InjectDatabase } from "./db/database.provider.js";

@Injectable()
export class AppService {
	constructor(
		@InjectDatabase()
		private readonly _database: AppDatabase,
	) {}

	/** Returns the public liveness payload used by clients and local tooling. */
	health(): { service: string; status: "ok" } {
		return { service: "interview-api", status: "ok" };
	}

	/** Confirms the API and its required PostgreSQL dependency are ready. */
	async readiness(): Promise<{
		service: string;
		status: "ok";
		dependencies: { database: "ok" };
	}> {
		await this._database.$client.query("select 1");
		return {
			service: "interview-api",
			status: "ok",
			dependencies: { database: "ok" },
		};
	}
}
