import axios, {
	type AxiosError,
	type AxiosRequestConfig,
	type AxiosResponse,
	isAxiosError,
} from "axios";
import { publishAuthRejected } from "@/shared/auth/session-events";
import { APP_CONFIG } from "@/shared/config/app.config";

const authenticationClient = axios.create({
	baseURL: `${APP_CONFIG.apiBaseUrl}/api/auth`,
	headers: { Accept: "application/json" },
	withCredentials: true,
});

/** Sends an Orval-generated Better Auth request without exposing cookies. */
export async function authApiClient<T>(config: AxiosRequestConfig): Promise<T> {
	try {
		const response: AxiosResponse<T> =
			await authenticationClient.request<T>(config);
		return response.data;
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 401) {
			publishAuthRejected();
		}
		throw error;
	}
}

export type ErrorType<Error> = AxiosError<Error>;
export type BodyType<Body> = Body;
