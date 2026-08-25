import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/shared/api/query-keys";
import { updateDevFlags } from "./lib";

export function useUpdateDevFlags() {
	const cache = useQueryClient();
	return useMutation({
		mutationFn: updateDevFlags,
		onSuccess(response) {
			cache.setQueryData(QUERY_KEYS.devFlags.current(), response);
		},
	});
}
