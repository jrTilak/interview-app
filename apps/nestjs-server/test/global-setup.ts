import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Recreates and migrates only the dedicated Docker test database. */
export default async function globalSetup(): Promise<void> {
	const pool = new Pool({
		host: "127.0.0.1",
		port: 55432,
		database: "interview_app_test",
		user: "interview_app",
		password: "interview_app",
	});
	try {
		await pool.query("drop schema if exists public cascade");
		await pool.query("drop schema if exists drizzle cascade");
		await pool.query("create schema public");
		await migrate(drizzle({ client: pool }), {
			migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
		});
	} finally {
		await pool.end();
	}
}
