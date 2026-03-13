"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { Conversation } from "@loyola-x/shared";

interface UseConversationsOptions {
  mindId?: string;
  limit?: number;
  offset?: number;
}

interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
}

export function useConversations(options?: UseConversationsOptions) {
  const apiClient = useApiClient();
  const { mindId, limit = 50, offset = 0 } = options ?? {};

  const { data, isLoading, error } = useQuery({
    queryKey: ["conversations", { mindId, limit, offset }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (mindId) params.set("mindId", mindId);
      return apiClient<ConversationListResponse>(
        `/api/conversations?${params.toString()}`,
      );
    },
  });

  return {
    conversations: data?.conversations,
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}

export function useDeleteConversation() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      apiClient<{ success: boolean }>(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
