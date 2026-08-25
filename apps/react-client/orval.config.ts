import { defineConfig } from "orval";

const applicationSchema =
	process.env.OPENAPI_SCHEMA_URL?.trim() ??
	"http://localhost:3000/api-docs.json";
const authenticationSchema =
	process.env.AUTH_OPENAPI_SCHEMA_URL?.trim() ??
	"http://localhost:3000/auth-docs.json";

export default defineConfig({
	application: {
		input: { target: applicationSchema },
		output: {
			client: "axios-functions",
			clean: true,
			mode: "tags-split",
			mock: false,
			override: {
				mutator: {
					name: "apiClient",
					path: "./src/shared/api/client.ts",
				},
			},
			schemas: "./src/shared/api/generated/application/models",
			target: "./src/shared/api/generated/application",
		},
	},
	authentication: {
		input: { target: authenticationSchema },
		output: {
			client: "axios-functions",
			clean: true,
			mode: "single",
			mock: false,
			override: {
				mutator: {
					name: "authApiClient",
					path: "./src/shared/api/auth-client.ts",
				},
			},
			target: "./src/shared/api/generated/authentication/index.ts",
		},
	},
});
