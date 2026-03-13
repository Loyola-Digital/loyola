export type TaskStatus =
  | "pending"
  | "open"
  | "in_progress"
  | "review"
  | "done"
  | "cancelled";

export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface CreateTaskRequest {
  conversationId: string;
  messageId: string;
  mindId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  tags?: string[];
}

export interface DelegatedTask {
  id: string;
  conversationId: string;
  messageId: string | null;
  userId: string;
  mindId: string;
  clickupTaskId: string;
  clickupUrl: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}
