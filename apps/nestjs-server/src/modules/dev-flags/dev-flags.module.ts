import { Global, Module } from "@nestjs/common";
import { DevFlagsController } from "./dev-flags.controller.js";
import { DevFlagsService } from "./dev-flags.service.js";

@Global()
@Module({
	controllers: [DevFlagsController],
	providers: [DevFlagsService],
	exports: [DevFlagsService],
})
export class DevFlagsModule {}
