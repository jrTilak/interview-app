import { createZodDto } from "nestjs-zod";
import { DevFlagsSchema, UpdateDevFlagsSchema } from "./dev-flags.schema.js";

export class DevFlagsResponseDto extends createZodDto(DevFlagsSchema) {}
export class UpdateDevFlagsDto extends createZodDto(UpdateDevFlagsSchema) {}
