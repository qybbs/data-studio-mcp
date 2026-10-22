/**
 * Stdio-safe logger for MCP Server.
 * All logs MUST be directed to stderr (console.error) so stdout is kept 100% clean for JSON-RPC messages.
 */
export const logger = {
  info: (msg: string, ...args: any[]) => console.error(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.error(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      console.error(`[DEBUG] ${msg}`, ...args);
    }
  }
};
