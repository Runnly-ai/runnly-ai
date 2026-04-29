import { createClient, RedisClientType } from 'redis';
import { CommandRepo } from './types/command-repo';
import { Command, CommandStatus } from './types/command';
/**
 * Redis-backed command repository with session index.
 */
export class RedisCommandRepo implements CommandRepo {
  private readonly client: RedisClientType;
  private readonly commandsKey: string;
  private readonly keyPrefix: string;

  /**
   * @param redisUrl Redis connection URL.
   * @param keyPrefix Key namespace prefix.
   */
  constructor(
    private readonly redisUrl: string,
    keyPrefix: string
  ) {
    this.client = createClient({ url: this.redisUrl });
    this.keyPrefix = keyPrefix;
    this.commandsKey = `${keyPrefix}:commands:data`;
  }

  /**
   * @returns Promise resolved when Redis client is connected.
   */
  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  /**
   * @param command Command record.
   * @returns Stored command.
   */
  async create(command: Command): Promise<Command> {
    await this.client.multi()
      .hSet(this.commandsKey, command.id, JSON.stringify(command))
      .sAdd(`${this.keyPrefix}:commands:session:${command.sessionId}`, command.id)
      .exec();
    return command;
  }

  /**
   * @param id Command id.
   * @param patch Partial command update.
   * @returns Updated command, or null.
   */
  async update(id: string, patch: Partial<Command>): Promise<Command | null> {
    const current = await this.getById(id);
    if (!current) {
      return null;
    }
    const next = { ...current, ...patch };
    await this.client.hSet(this.commandsKey, id, JSON.stringify(next));
    return next;
  }

  async claimPending(id: string, claimToken: string, claimedAt: number): Promise<Command | null> {
    const script = `
local key = KEYS[1]
local id = ARGV[1]
local token = ARGV[2]
local claimedAt = tonumber(ARGV[3])
local raw = redis.call('HGET', key, id)
if not raw then
  return nil
end
local obj = cjson.decode(raw)
if obj.status ~= 'PENDING' then
  return nil
end
obj.status = 'RUNNING'
obj.claimToken = token
obj.claimedAt = claimedAt
obj.updatedAt = claimedAt
local next = cjson.encode(obj)
redis.call('HSET', key, id, next)
return next
`;

    const result = await this.client.eval(script, {
      keys: [this.commandsKey],
      arguments: [id, claimToken, String(claimedAt)],
    });
    if (!result || typeof result !== 'string') {
      return null;
    }
    return JSON.parse(result) as Command;
  }

  /**
   * @param id Command id.
   * @returns Command record, or null.
   */
  async getById(id: string): Promise<Command | null> {
    const raw = await this.client.hGet(this.commandsKey, id);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Command;
  }

  /**
   * @param sessionId Session id.
   * @returns Session commands sorted by creation timestamp.
   */
  async listBySessionId(sessionId: string): Promise<Command[]> {
    const ids = await this.client.sMembers(`${this.keyPrefix}:commands:session:${sessionId}`);
    if (ids.length === 0) {
      return [];
    }
    const raws = await this.client.hmGet(this.commandsKey, ids);
    const commands: Command[] = [];
    for (const raw of raws) {
      if (raw) {
        commands.push(JSON.parse(raw) as Command);
      }
    }
    commands.sort((a, b) => a.createdAt - b.createdAt);
    return commands;
  }

  /**
   * @returns Promise resolved when Redis client is closed.
   */
  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
