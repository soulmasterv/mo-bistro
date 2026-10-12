/** Expected workflow conflicts are safe to show; infrastructure errors are not. */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}
