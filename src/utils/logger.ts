const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: string, message: string, ...args: unknown[]): void {
  const logLevel = process.env.LOG_LEVEL ?? "info";
  if ((LEVELS[level as keyof typeof LEVELS] ?? 0) < (LEVELS[logLevel as keyof typeof LEVELS] ?? 1)) return;
  const extra = args.length > 0 ? " " + args.map(a => JSON.stringify(a)).join(" ") : "";
  process.stderr.write(`[${level.toUpperCase()}] ${message}${extra}\n`);
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log("debug", msg, ...args),
  info:  (msg: string, ...args: unknown[]) => log("info",  msg, ...args),
  warn:  (msg: string, ...args: unknown[]) => log("warn",  msg, ...args),
  error: (msg: string, ...args: unknown[]) => log("error", msg, ...args),
};
