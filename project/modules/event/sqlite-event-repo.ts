import { applySchemaFile, SqliteDatabaseClient } from '../db';
import { EventRecord } from './types/event';
import { EventRepo } from './types/event-repo';

export class SqliteEventRepo implements EventRepo {
  private readonly db: SqliteDatabaseClient;
  constructor(filename: string) { this.db = new SqliteDatabaseClient(filename); }
  async connect(): Promise<void> { await this.db.connect(); await applySchemaFile(this.db, 'sqlite'); }
  async close(): Promise<void> { await this.db.close(); }
  async append(event: EventRecord): Promise<EventRecord> {
    await this.db.run('INSERT INTO events (id, session_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)', [event.id, event.sessionId, event.type, JSON.stringify(event.payload||{}), event.createdAt]);
    return event;
  }
  async listBySessionId(sessionId: string): Promise<EventRecord[]> { return (await this.db.query<any>('SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC', [sessionId])).map((r)=>({ id:r.id, sessionId:r.session_id, type:r.type, payload:JSON.parse(r.payload||'{}'), createdAt:r.created_at })); }
}
