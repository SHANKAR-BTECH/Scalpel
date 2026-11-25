/**
 * The shared database. Every action is one entry in a hash-chained audit log (the engine's appendEntry), so the
 * log is both the source of truth and the tamper-evident record. Notifications and the demo clock sit beside it.
 *
 * With DATABASE_URL set (Neon Postgres on Vercel) every user and every browser sees the same desk.
 * Without it the desk lives in this server's memory: fine for one machine (development, tests), but on Vercel
 * different visitors can land on different copies, so the Admin page says so.
 */
import { appendEntry, type AuditEntry, type Json } from "@scalpel/engine";

export interface Note { id: number; at: number; to: string; text: string; link: string; read: boolean }
export interface Clock { offsetMs: number; startedAt: number }
type Draft = Omit<AuditEntry, "seq" | "prevHash" | "hash">;

export interface Store {
  kind: "postgres" | "memory";
  chain(): Promise<AuditEntry[]>;
  /** Appends in order; a clash with a concurrent writer is retried on the new chain head. */
  append(drafts: Draft[], check?: (chain: AuditEntry[]) => void): Promise<AuditEntry[]>;
  notify(notes: Omit<Note, "id" | "read">[]): Promise<void>;
  notes(to: string, limit?: number): Promise<Note[]>;
  markRead(to: string): Promise<void>;
  clock(): Promise<Clock>;
  setClock(c: Clock): Promise<void>;
  /** A number that changes whenever anything changes: browsers poll it to know when to refresh. */
  version(): Promise<string>;
  reset(): Promise<void>;
}

type Q = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export class MemoryStore implements Store {
  kind = "memory" as const;
  private log: AuditEntry[] = [];
  private ns: Note[] = [];
  private clk: Clock | null = null;
  private rev = 0;
  async chain() { return [...this.log]; }
  async append(drafts: Draft[], check?: (chain: AuditEntry[]) => void) {
    check?.(this.log);
    const out: AuditEntry[] = [];
    for (const d of drafts) { const e = await appendEntry(this.log, d); this.log.push(e); out.push(e); }
    this.rev++;
    return out;
  }
  async notify(notes: Omit<Note, "id" | "read">[]) { for (const n of notes) this.ns.push({ ...n, id: this.ns.length + 1, read: false }); this.rev++; }
  async notes(to: string, limit = 30) { return this.ns.filter((n) => n.to === to).slice(-limit).reverse(); }
  async markRead(to: string) { for (const n of this.ns) if (n.to === to) n.read = true; this.rev++; }
  async clock() { return (this.clk ??= { offsetMs: 0, startedAt: Date.now() }); }
  async setClock(c: Clock) { this.clk = c; this.rev++; }
  async version() { return `m${this.rev}`; }
  async reset() { this.log = []; this.ns = []; this.clk = { offsetMs: 0, startedAt: Date.now() }; this.rev++; }
}

const SCHEMA = [
  `create table if not exists audit (seq integer primary key, at bigint not null, actor text not null, type text not null,
     case_id text not null, payload jsonb not null, prev_hash text not null unique, hash text not null)`,
  `create table if not exists notes (id serial primary key, at bigint not null, recipient text not null, text text not null,
     link text not null, read boolean not null default false)`,
  `create table if not exists kv (k text primary key, v jsonb not null)`,
];

const toEntry = (r: Record<string, unknown>): AuditEntry => ({
  seq: Number(r.seq), at: Number(r.at), actor: String(r.actor), type: String(r.type), caseId: String(r.case_id),
  payload: (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as Json, prevHash: String(r.prev_hash), hash: String(r.hash),
});

export class PgStore implements Store {
  kind = "postgres" as const;
  private ready: Promise<void> | null = null;
  constructor(private q: Q) {}
  private init() { return (this.ready ??= (async () => { for (const s of SCHEMA) await this.q(s); })()); }
  async chain() { await this.init(); return (await this.q("select * from audit order by seq")).map(toEntry); }
  async append(drafts: Draft[], check?: (chain: AuditEntry[]) => void) {
    await this.init();
    for (let attempt = 0; attempt < 5; attempt++) {
      const chain = await this.chain();
      check?.(chain);
      const out: AuditEntry[] = [];
      const work = [...chain];
      for (const d of drafts) { const e = await appendEntry(work, d); work.push(e); out.push(e); }
      try {
        // One statement, so the batch lands whole or not at all. seq and prev_hash are unique: a writer that raced us
        // makes this fail, and we rebuild on the new head.
        const cols = out.flatMap((e) => [e.seq, e.at, e.actor, e.type, e.caseId, JSON.stringify(e.payload), e.prevHash, e.hash]);
        const rows = out.map((_, i) => `(${Array.from({ length: 8 }, (_, j) => `$${i * 8 + j + 1}`).join(",")})`).join(",");
        await this.q(`insert into audit (seq, at, actor, type, case_id, payload, prev_hash, hash) values ${rows}`, cols);
        return out;
      } catch (err) {
        if (!/duplicate|unique/i.test(String(err))) throw err;
      }
    }
    throw new Error("Too many people acted at once. Please try again.");
  }
  async notify(notes: Omit<Note, "id" | "read">[]) {
    await this.init();
    for (const n of notes) await this.q("insert into notes (at, recipient, text, link) values ($1,$2,$3,$4)", [n.at, n.to, n.text, n.link]);
  }
  async notes(to: string, limit = 30) {
    await this.init();
    return (await this.q("select * from notes where recipient = $1 order by id desc limit $2", [to, limit]))
      .map((r) => ({ id: Number(r.id), at: Number(r.at), to: String(r.recipient), text: String(r.text), link: String(r.link), read: Boolean(r.read) }));
  }
  async markRead(to: string) { await this.init(); await this.q("update notes set read = true where recipient = $1 and read = false", [to]); await this.bump(); }
  async clock() {
    await this.init();
    const r = await this.q("select v from kv where k = 'clock'");
    if (r[0]) return (typeof r[0].v === "string" ? JSON.parse(r[0].v) : r[0].v) as Clock;
    const c = { offsetMs: 0, startedAt: Date.now() };
    await this.setClock(c);
    return c;
  }
  async setClock(c: Clock) {
    await this.init();
    await this.q("insert into kv (k, v) values ('clock', $1) on conflict (k) do update set v = excluded.v", [JSON.stringify(c)]);
    await this.bump();
  }
  private async bump() { await this.q("insert into kv (k, v) values ('rev', '1') on conflict (k) do update set v = to_jsonb((kv.v)::text::int + 1)"); }
  async version() {
    await this.init();
    const r = await this.q("select (select coalesce(max(seq), -1) from audit) as a, (select coalesce(max(id), 0) from notes) as n, (select v from kv where k = 'rev') as r");
    return `p${r[0]?.a}.${r[0]?.n}.${JSON.stringify(r[0]?.r ?? 0)}`;
  }
  async reset() {
    await this.init();
    await this.q("delete from audit");
    await this.q("delete from notes");
    await this.setClock({ offsetMs: 0, startedAt: Date.now() });
  }
}

const g = globalThis as unknown as { __scalpelStore?: Store };

export async function store(): Promise<Store> {
  if (g.__scalpelStore) return g.__scalpelStore;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    g.__scalpelStore = new PgStore(async (text, params = []) => (await sql.query(text, params)) as Record<string, unknown>[]);
  } else {
    g.__scalpelStore = new MemoryStore();
  }
  return g.__scalpelStore;
}

/** For tests. */
export function useStore(s: Store) { g.__scalpelStore = s; }
