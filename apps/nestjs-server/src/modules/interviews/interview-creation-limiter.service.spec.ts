import { jest } from "@jest/globals";
import { HttpException } from "@nestjs/common";
import { InterviewCreationLimiterService } from "./interview-creation-limiter.service.js";

describe("InterviewCreationLimiterService", () => {
	it("single-flights an identical concurrent creation", async () => {
		const limiter = new InterviewCreationLimiterService();
		let release: ((value: string) => void) | undefined;
		const operation = jest.fn(
			() =>
				new Promise<string>((resolve) => {
					release = resolve;
				}),
		);

		const first = limiter.run("user-1", "request-1", operation);
		const duplicate = limiter.run("user-1", "request-1", operation);
		await Promise.resolve();
		release?.("created");

		await expect(Promise.all([first, duplicate])).resolves.toEqual([
			"created",
			"created",
		]);
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it("rejects a second distinct in-flight create for the same user", async () => {
		const limiter = new InterviewCreationLimiterService();
		let release: (() => void) | undefined;
		const first = limiter.run(
			"user-1",
			"request-1",
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);

		expect(() =>
			limiter.run("user-1", "request-2", async () => undefined),
		).toThrow(HttpException);
		await Promise.resolve();
		release?.();
		await first;
	});

	it("limits provider-backed creations within the fixed window", async () => {
		const limiter = new InterviewCreationLimiterService();
		for (let index = 0; index < 5; index += 1) {
			await limiter.run("user-1", `request-${index}`, async () => index);
		}

		expect(() =>
			limiter.run("user-1", "request-6", async () => undefined),
		).toThrow(HttpException);
	});
});
