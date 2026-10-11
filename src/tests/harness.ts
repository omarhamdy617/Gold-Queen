// أدوات تشغيل الاختبارات التلقائية (مش جزء من السيستم نفسه - مبتتحملش في أي صفحة).
//
// الاختبارات بتشغّل السيستم الحقيقي من أوله لآخره: قاعدة بيانات Postgres تجريبية فاضية، نفس الـschema
// بالظبط، نسخة مبنية من الكود (next build)، تسجيل دخول حقيقي، وبعدين بتنادي نفس الـserver actions اللي
// الشاشات بتناديها (بنفس الطريقة اللي المتصفح بيبعتها بيها)، وبتتأكد من الأرقام في قاعدة البيانات.
//
// التشغيل:  npx tsx --test src/tests/*.test.ts
//   - لو فيه Postgres محلي (initdb/pg_ctl) الاختبار بيعمل قاعدة مؤقتة لوحده ويمسحها في الآخر.
//   - أو ابعت TEST_DATABASE_URL لقاعدة بيانات فاضية مخصوصة للاختبار (أبدًا مش قاعدة الإنتاج).
//   - لو الكود اتغيّر بعد آخر next build، الاختبار بيعمل build جديد الأول تلقائيًا.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import postgres from "postgres";
import ExcelJS from "exceljs";

export const ROOT = join(__dirname, "..", "..");
const SECRET = "test-only-secret-not-for-production-0123456789";
export const ADMIN = { username: "testadmin", password: "TestPass#2026" };

function run(cmd: string, args: string[], env: Record<string, string | undefined> = {}, opts: { asPostgres?: boolean } = {}) {
  const useSu = opts.asPostgres && process.getuid?.() === 0;
  const res = useSu
    ? spawnSync("su", ["postgres", "-c", [cmd, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")], { encoding: "utf8" })
    : spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`فشل تشغيل ${cmd} ${args.join(" ")}\n${res.stdout}\n${res.stderr}`);
  }
  return res.stdout;
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

function pgBinDir() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try {
    return spawnSync("pg_config", ["--bindir"], { encoding: "utf8" }).stdout.trim() || "/usr/lib/postgresql/16/bin";
  } catch {
    return "/usr/lib/postgresql/16/bin";
  }
}

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(p));
    else newest = Math.max(newest, statSync(p).mtimeMs);
  }
  return newest;
}

function ensureBuild() {
  const buildId = join(ROOT, ".next", "BUILD_ID");
  const srcNewest = newestMtime(join(ROOT, "src"));
  if (existsSync(buildId) && statSync(buildId).mtimeMs > srcNewest) return;
  run("npx", ["next", "build"], { DATABASE_URL: "postgresql://build:build@localhost:5432/build_only", NEXTAUTH_SECRET: SECRET });
}

export type Env = {
  sql: postgres.Sql;
  baseUrl: string;
  cookie: string;
  action: <T = any>(exportedName: string, args: unknown[]) => Promise<T>;
  get: (path: string) => Promise<Response>;
  xlsx: (path: string) => Promise<ExcelJS.Workbook>;
  ids: { cash: string; vodafone: string; shop: string };
  stop: () => Promise<void>;
};

export async function startEnv(): Promise<Env> {
  // لو أي خطوة فشلت في النص، لازم نقفل اللي اتفتح قبلها (قاعدة البيانات المؤقتة والسيرفر) - وإلا بيفضلوا شغالين
  const cleanups: (() => void)[] = [];
  try {
    return await startEnvInner(cleanups);
  } catch (e) {
    for (const c of cleanups.reverse()) {
      try {
        c();
      } catch {}
    }
    throw e;
  }
}

async function startEnvInner(cleanups: (() => void)[]): Promise<Env> {
  ensureBuild();

  // 1) قاعدة بيانات فاضية
  let dbUrl = process.env.TEST_DATABASE_URL || "";
  let pgDir = "";
  if (!dbUrl) {
    const bin = pgBinDir();
    pgDir = mkdtempSync("/var/tmp/gq-test-");
    chmodSync(pgDir, 0o777);
    const port = await freePort();
    if (process.getuid?.() === 0) spawnSync("chown", ["postgres:postgres", pgDir]);
    run(join(bin, "initdb"), ["-D", join(pgDir, "data"), "-A", "trust", "-U", "postgres"], {}, { asPostgres: true });
    run(join(bin, "pg_ctl"), ["-D", join(pgDir, "data"), "-o", `-p ${port} -k ${pgDir}`, "-l", join(pgDir, "log.txt"), "-w", "start"], {}, { asPostgres: true });
    const dir = pgDir;
    cleanups.push(() => {
      run(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "fast", "stop"], {}, { asPostgres: true });
      rmSync(dir, { recursive: true, force: true });
    });
    run(join(bin, "createdb"), ["-h", "localhost", "-p", String(port), "-U", "postgres", "gq_test"], {}, { asPostgres: true });
    dbUrl = `postgresql://postgres@localhost:${port}/gq_test`;
  }

  // 2) نفس الـschema بالظبط (من schema.ts) + بيانات التهيئة الأولى (seed)
  const cfg = join(ROOT, "drizzle.test-run.config.ts");
  const u = new URL(dbUrl);
  writeFileSync(
    cfg,
    `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ schema: "./src/db/schema.ts", dialect: "postgresql", dbCredentials: { host: ${JSON.stringify(u.hostname)}, port: ${Number(u.port || 5432)}, user: ${JSON.stringify(decodeURIComponent(u.username))}, ${u.password ? `password: ${JSON.stringify(decodeURIComponent(u.password))}, ` : ""}database: ${JSON.stringify(u.pathname.slice(1))}, ssl: false } });\n`
  );
  try {
    run("npx", ["drizzle-kit", "push", `--config=${cfg}`, "--force"]);
  } finally {
    rmSync(cfg, { force: true });
  }
  run("npx", ["tsx", "src/db/seed.ts"], { DATABASE_URL: dbUrl, SEED_ADMIN_USERNAME: ADMIN.username, SEED_ADMIN_PASSWORD: ADMIN.password });

  // 3) السيرفر الحقيقي (next start) على القاعدة دي
  const port = await freePort();
  const baseUrl = `http://localhost:${port}`;
  const server: ChildProcess = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl, NEXTAUTH_SECRET: SECRET, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  cleanups.push(() => {
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {}
  });
  let serverLog = "";
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${baseUrl}/login`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (i === 59) throw new Error("السيرفر مشتغلش:\n" + serverLog);
  }

  // 4) تسجيل دخول حقيقي
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  const setCookie = login.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  if (!login.ok || !cookie) throw new Error("فشل تسجيل الدخول: " + (await login.text()));

  // 5) أكواد الـserver actions من نسخة البناء
  const manifest = JSON.parse(readFileSync(join(ROOT, ".next", "server", "server-reference-manifest.json"), "utf8"));
  const actionIndex = new Map<string, { id: string; page: string }>();
  for (const [id, v] of Object.entries<any>(manifest.node || {})) {
    const name = v.exportedName;
    if (!name) continue;
    const pages = Object.keys(v.workers || {})
      .filter((w) => w.startsWith("app/") && w.endsWith("/page") && !w.includes("["))
      .map((w) => "/" + w.replace(/^app\//, "").replace(/\/page$/, "").split("/").filter((seg) => !/^\(.*\)$/.test(seg)).join("/"));
    if (pages.length && !actionIndex.has(name)) actionIndex.set(name, { id, page: pages[0] === "/" ? "/" : pages[0] });
  }

  const action = async <T = any>(exportedName: string, args: unknown[]): Promise<T> => {
    const a = actionIndex.get(exportedName);
    if (!a) throw new Error(`الأكشن ${exportedName} مش موجود في نسخة البناء (مش مستخدم من أي شاشة؟)`);
    const res = await fetch(baseUrl + a.page, {
      method: "POST",
      headers: { Cookie: cookie, "Next-Action": a.id, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    const lines = new Map<string, string>();
    for (const line of text.split("\n")) {
      const m = line.match(/^([0-9a-f]+):(.*)$/);
      if (m) lines.set(m[1], m[2]);
    }
    const head = lines.get("0");
    if (!head) throw new Error(`رد غير متوقع من ${exportedName} (${res.status}): ${text.slice(0, 300)}`);
    const ref = JSON.parse(head).a;
    if (ref === "$undefined" || ref === undefined) return undefined as T;
    if (typeof ref === "string" && ref.startsWith("$@")) {
      const body = lines.get(ref.slice(2));
      return (body === undefined ? undefined : JSON.parse(body)) as T;
    }
    return ref as T;
  };

  const sql = postgres(dbUrl, { max: 2, onnotice: () => {} });
  const [cash] = await sql`select id from payment_methods where name = 'كاش'`;
  const [vodafone] = await sql`select id from payment_methods where name = 'فودافون كاش'`;
  const [shop] = await sql`select id from locations where type = 'SHOP' limit 1`;

  const get = (path: string) => fetch(baseUrl + path, { headers: { Cookie: cookie } });
  const xlsx = async (path: string) => {
    const r = await get(path);
    if (!r.ok) throw new Error(`تصدير ${path} فشل (${r.status}): ${await r.text()}`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await r.arrayBuffer()) as any);
    return wb;
  };

  const stop = async () => {
    await sql.end({ timeout: 2 });
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {}
    if (pgDir) {
      try {
        run(join(pgBinDir(), "pg_ctl"), ["-D", join(pgDir, "data"), "-m", "fast", "stop"], {}, { asPostgres: true });
      } catch {}
      rmSync(pgDir, { recursive: true, force: true });
    }
  };

  return { sql, baseUrl, cookie, action, get, xlsx, ids: { cash: cash.id, vodafone: vodafone.id, shop: shop.id }, stop };
}

// رصيد الخزينة دلوقتي + اتأكد إن سجل حركاتها متسلسل صح: كل حركة الفرق بين رصيدها بعدها والرصيد اللي قبلها
// لازم يساوي مبلغها بالظبط (زيادة أو نقصان)، وآخر رصيد في السجل = رصيد الخزينة الفعلي.
export async function drawerBalance(sql: postgres.Sql, paymentMethodId: string): Promise<number> {
  const [d] = await sql`select id, balance from cash_drawers where payment_method_id = ${paymentMethodId}`;
  const txs = await sql`select amount, balance_after from cash_transactions where drawer_id = ${d.id} order by created_at, id`;
  let prev = 0;
  for (const t of txs) {
    const diff = Math.abs(Number(t.balance_after) - prev);
    if (Math.abs(diff - Number(t.amount)) > 0.001) {
      throw new Error(`سجل الخزينة متلخبط: حركة بمبلغ ${t.amount} والرصيد اتغيّر ${diff}`);
    }
    prev = Number(t.balance_after);
  }
  if (Math.abs(prev - Number(d.balance)) > 0.001) throw new Error(`آخر رصيد في السجل ${prev} مش زي رصيد الخزينة ${d.balance}`);
  return Number(d.balance);
}

export async function stockOf(sql: postgres.Sql, productId: string): Promise<number> {
  const [r] = await sql`select coalesce(sum(quantity), 0)::int as q from stocks where product_id = ${productId}`;
  return Number(r.q);
}

export function expectOk<T>(r: T): T {
  if (r && typeof r === "object" && "error" in (r as any)) throw new Error("الأكشن رجّع خطأ: " + (r as any).error);
  return r;
}

// قيمة خلية في شيت Excel بالبحث عن نص في عمود A (للملخصات)
export function sheetValue(wb: ExcelJS.Workbook, sheet: string, label: string): number | null {
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new Error(`الشيت ${sheet} مش موجود`);
  let found: number | null = null;
  ws.eachRow((row) => {
    if (String(row.getCell(1).value ?? "") === label) found = Number(row.getCell(2).value);
  });
  return found;
}

export function todayCairo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
