/** Extracts the required data property from the server's success envelope. */
export function requireResponseData<T>(response: { data?: T }): T {
	if (response.data === undefined) {
		throw new Error("The server returned an incomplete response.");
	}
	return response.data;
}
