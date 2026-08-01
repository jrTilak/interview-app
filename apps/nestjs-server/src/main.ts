import "reflect-metadata";
import { bootstrapApplication } from "./bootstrap/bootstrap.js";

/** Starts the server and lets Nest report fatal bootstrap failures. */
async function main(): Promise<void> {
	await bootstrapApplication();
}

void main();
