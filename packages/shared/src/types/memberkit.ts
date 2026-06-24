/**
 * Story 19.11 — Integração nativa MemberKit (área de membros).
 * A integração é OUTBOUND: o Loyola X chama a API do MemberKit
 * (`POST /api/v1/users`, auth via `?api_key=`) para matricular o comprador
 * de uma venda lançada na etapa de Evento Presencial.
 */

/** Status de uma matrícula MemberKit atrelada a uma venda manual. */
export type MemberkitEnrollmentStatus =
  | "pending" // venda sem email ou aguardando disparo → ainda não matriculou
  | "enrolled" // matrícula confirmada (POST /users 2xx)
  | "failed" // tentativa falhou (erro do MemberKit / rede) — retryável
  | "skipped"; // sem connection/config/autoEnroll → não tentou

/** Status do membro no MemberKit (espelha o enum `status` do POST /users). */
export type MemberkitMemberStatus = "active" | "inactive" | "pending" | "expired";

/** Resposta do GET de connection do projeto (nunca expõe a key). */
export interface MemberkitConnectionStatus {
  connected: boolean;
}

/** Turma (classroom) do MemberKit — alvo de matrícula (`classroom_ids`). */
export interface MemberkitClassroom {
  id: number;
  name: string;
  courseName: string | null;
}

/** Curso do MemberKit (para exibição/agrupamento na UI). */
export interface MemberkitCourse {
  id: number;
  name: string;
}

/** Config de matrícula por etapa (qual turma matricular ao lançar a venda). */
export interface StageMemberkitEnrollment {
  stageId: string;
  classroomIds: number[];
  status: MemberkitMemberStatus;
  autoEnroll: boolean;
}

export interface SetStageMemberkitEnrollmentInput {
  classroomIds: number[];
  status?: MemberkitMemberStatus;
  autoEnroll?: boolean;
}
