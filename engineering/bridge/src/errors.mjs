/** An expected failure with a stable code; the CLI prints the message without a stack trace. */
export class BridgeError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}
