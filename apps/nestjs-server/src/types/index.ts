import type { ConfigService } from "@nestjs/config";
import type { Environment } from "#src/config/environment.schema.js";

export type AppConfigService = ConfigService<Environment, true>;
