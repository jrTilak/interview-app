import { Controller, Get, type INestApplication } from "@nestjs/common";
import { ApiProperty, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { ApiSessionAuth } from "./api-session-auth.decorator.js";
import { ApiSuccess } from "./api-success.decorator.js";

class ContractItemDto {
	@ApiProperty()
	id!: string;
}

@Controller("contract")
class ContractController {
	@Get("one")
	@ApiSessionAuth()
	@ApiSuccess({ description: "One item.", type: ContractItemDto })
	one(): void {}

	@Get("many")
	@ApiSuccess({
		description: "Many items.",
		type: ContractItemDto,
		isArray: true,
	})
	many(): void {}

	@Get("empty")
	@ApiSuccess({ description: "No data.", status: 204 })
	empty(): void {}
}

describe("shared API decorators", () => {
	let app: INestApplication;

	afterEach(async () => {
		if (app) await app.close();
	});

	it("documents authentication and typed success envelopes", async () => {
		const moduleRef = await Test.createTestingModule({
			controllers: [ContractController],
		}).compile();
		app = moduleRef.createNestApplication();
		await app.init();

		const document = SwaggerModule.createDocument(
			app,
			new DocumentBuilder()
				.addCookieAuth(
					"better-auth.session_token",
					{ type: "apiKey", in: "cookie" },
					"betterAuthSession",
				)
				.build(),
		);
		const one = document.paths["/contract/one"]?.get;
		const many = document.paths["/contract/many"]?.get;
		const empty = document.paths["/contract/empty"]?.get;

		expect(one?.security).toEqual([{ betterAuthSession: [] }]);
		expect(JSON.stringify(one?.responses["401"])).toContain(
			"ApiErrorResponseDto",
		);
		expect(JSON.stringify(one?.responses["200"])).toContain("ContractItemDto");
		expect(many?.responses["200"]).toMatchObject({
			description: "Many items.",
		});
		expect(JSON.stringify(many?.responses["200"])).toContain('"type":"array"');
		expect(empty?.responses["204"]).toMatchObject({
			description: "No data.",
		});
		expect(document.components?.schemas).toHaveProperty(
			"ApiSuccessResponseDto",
		);
		expect(document.components?.schemas).toHaveProperty("ApiErrorResponseDto");
		expect(document.components?.schemas).toHaveProperty("ContractItemDto");
	});
});
