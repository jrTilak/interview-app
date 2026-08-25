import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DatabaseLifecycleService } from "../../db/database-lifecycle.service.js";

@Injectable()
export class ApplicationStartupService implements OnApplicationBootstrap {
	constructor(private readonly _databaseLifecycle: DatabaseLifecycleService) {}

	/** Runs each imported service's startup work in dependency order. */
	async onApplicationBootstrap(): Promise<void> {
		await this._databaseLifecycle.startup();
	}
}
