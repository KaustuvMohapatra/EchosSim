/** Logging abstraction: domain code never touches console/DOM directly. */

/* eslint-disable no-console */
declare const console: {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export interface SimLog {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class NullSimLog implements SimLog {
  static instance = new NullSimLog();
  info(_: string): void {}
  warn(_: string): void {}
  error(_: string): void {}
}

export class ConsoleSimLog implements SimLog {
  info(message: string): void { console.log(message); }
  warn(message: string): void { console.warn("[WARN] " + message); }
  error(message: string): void { console.error("[ERROR] " + message); }
}
