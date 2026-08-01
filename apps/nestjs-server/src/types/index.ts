import type { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.schema.js";

export type AppConfigService = ConfigService<Environment, true>;
