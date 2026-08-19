import { getRuntime } from "../../../../lib/workoutpal";

async function handler(request: Request): Promise<Response> {
  return getRuntime().auth.handler(request);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
