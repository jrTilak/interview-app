import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: process.env.ENV_FILE_PATH || ".env" });

/** Returns one required environment variable for the Drizzle CLI. */
function requiredEnvironment(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/schema/index.ts",
	out: "./src/db/migrations",
	dbCredentials: {
		host: requiredEnvironment("DB_HOST"),
		port: Number(process.env.DB_PORT ?? 5432),
		user: requiredEnvironment("DB_USERNAME"),
		password: requiredEnvironment("DB_PASSWORD"),
		database: requiredEnvironment("DB_NAME"),
		ssl: process.env.PGSSLMODE === "disable" ? false : undefined,
	},
});
