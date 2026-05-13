import { Session } from "./session";


/**
 * Session repository contract.
 */
export interface SessionRepo {
  connect(): Promise<void>;
  create(session: Session): Promise<Session>;
  getById(id: string): Promise<Session | null>;
  listByUserId(userId: string): Promise<Session[]>;
  listByProjectId(projectId: string): Promise<Session[]>;
  update(id: string, patch: Partial<Session>): Promise<Session | null>;
  close(): Promise<void>;
}
