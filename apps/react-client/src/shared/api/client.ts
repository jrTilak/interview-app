import axios, {
	type AxiosError,
	type AxiosRequestConfig,
	type AxiosResponse,
	isAxiosError,
} from "axios";
import { publishAuthRejected } from "@/shared/auth/session-events";
import { APP_CONFIG } from "@/shared/config/app.config";

const applicationClient = axios.create({
	baseURL: APP_CONFIG.apiBaseUrl,
	headers: { Accept: "application/json" },
	paramsSerializer: { indexes: null },
	withCredentials: true,
});

/** Sends an Orval-generated application request with opaque cookie auth. */
export async function apiClient<T>(
	config: AxiosRequestConfig,
	options?: AxiosRequestConfig,
): Promise<T> {
	try {
		const response: AxiosResponse<T> = await applicationClient.request<T>({
			...config,
			...options,
			headers: { ...config.headers, ...options?.headers },
		});
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
