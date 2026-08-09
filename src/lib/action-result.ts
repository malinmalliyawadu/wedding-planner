export type ActionResult =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export const idleResult: ActionResult = { status: "idle" };
