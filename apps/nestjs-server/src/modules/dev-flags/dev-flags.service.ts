import { Injectable } from "@nestjs/common";
import type { UpdateDevFlagsDto } from "./dev-flags.dto.js";
import { DEFAULT_DEV_FLAGS, type DevFlags } from "./dev-flags.schema.js";

/** Owns one process-wide flag snapshot used by every session in development. */
@Injectable()
export class DevFlagsService {
	private _flags: DevFlags = { ...DEFAULT_DEV_FLAGS };

	get(): DevFlags {
		return { ...this._flags };
	}

	update(changes: UpdateDevFlagsDto): DevFlags {
		this._flags = { ...this._flags, ...changes };
		return this.get();
	}
}
