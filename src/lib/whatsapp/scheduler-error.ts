/** Bounded operational codes only. Never retain provider bodies or credentials. */
export class SchedulerError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SchedulerError";
  }
}

export function schedulerErrorCode(error: unknown): string {
  return error instanceof SchedulerError &&
    /^(?:scheduler_(?:token_missing|callback_invalid|url_invalid|network_failed|response_invalid)|scheduler_http_[1-5]\d{2})$/.test(error.code)
    ? error.code : "publish_failed";
}
