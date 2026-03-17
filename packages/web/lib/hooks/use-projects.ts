"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Project {
  id: string;
  name: string;
  clientName: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  clientName: string;
  description?: string;
  color?: string;
}

// GET /api/projects — scoped by authenticated user
export function useProjects() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiClient<Project[]>("/api/projects"),
  });
}

// POST /api/projects
export function useCreateProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectInput) =>
      apiClient<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// ============================================================
// Member types
// ============================================================

export interface ProjectPermissions {
  instagram: boolean;
  conversations: boolean;
  mind: boolean;
}

export interface ProjectMember {
  id: string;
  userId: string;
  role: string;
  permissions: ProjectPermissions;
  createdAt: string;
  userName: string;
  userEmail: string;
}

export interface InviteMemberInput {
  email: string;
  permissions: ProjectPermissions;
}

// GET /api/projects/:id/members
export function useProjectMembers(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => apiClient<ProjectMember[]>(`/api/projects/${projectId}/members`),
    enabled: !!projectId,
  });
}

// GET /api/projects/:id/my-membership (current user's permissions)
export function useMyMembership(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["my-membership", projectId],
    queryFn: () => apiClient<{ permissions: ProjectPermissions }>(`/api/projects/${projectId}/my-membership`),
    enabled: !!projectId,
    retry: false,
  });
}

// POST /api/projects/:id/invitations
export function useInviteMember(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteMemberInput) =>
      apiClient<{ inviteUrl: string; expiresAt: string }>(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
  });
}

// DELETE /api/projects/:id/members/:userId
export function useRemoveMember(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient<void>(`/api/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
  });
}

// PATCH /api/projects/:id/members/:userId/permissions
export function useUpdateMemberPermissions(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: ProjectPermissions }) =>
      apiClient<{ permissions: ProjectPermissions }>(
        `/api/projects/${projectId}/members/${userId}/permissions`,
        {
          method: "PATCH",
          body: JSON.stringify({ permissions }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    },
  });
}

// DELETE /api/projects/:id
export function useDeleteProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/projects/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
