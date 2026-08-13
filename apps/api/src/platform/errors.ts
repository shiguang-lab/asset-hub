import type { ProblemDetails } from "@shiguang/contracts";
import type { FastifyReply } from "fastify";

export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly recoveries: string[] = [],
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (resource: string): DomainError =>
  new DomainError(404, "RESOURCE_NOT_FOUND", `${resource} 不存在`, ["back"]);

export const forbidden = (message = "没有权限执行该操作"): DomainError =>
  new DomainError(403, "FORBIDDEN", message, ["request_access"]);

export const unauthorized = (message = "未认证或凭证已失效"): DomainError =>
  new DomainError(401, "UNAUTHORIZED", message, ["sign_in"]);

export const conflict = (code: string, message: string, recoveries: string[] = []): DomainError =>
  new DomainError(409, code, message, recoveries);

export const badRequest = (
  code: string,
  message: string,
  fields?: Record<string, string[]>,
): DomainError => new DomainError(400, code, message, [], fields);

export const tooManyRequests = (message = "请求过于频繁，请稍后重试"): DomainError =>
  new DomainError(429, "RATE_LIMITED", message, ["wait_retry_after"]);

export function sendProblem(reply: FastifyReply, problem: ProblemDetails): FastifyReply {
  return reply
    .status(problem.status)
    .header("content-type", "application/problem+json")
    .send(problem);
}

export function toProblem(err: unknown, requestId?: string): ProblemDetails {
  if (err instanceof DomainError) {
    return {
      type: `https://docs.shiguanglab.com/problems/${err.code.toLowerCase()}`,
      title: err.code,
      status: err.status,
      code: err.code,
      detail: err.message,
      instance: requestId ? `/requests/${requestId}` : undefined,
      requestId,
      recoveries: err.recoveries,
      fields: err.fields,
    };
  }
  if (err instanceof Error && err.message.includes("ASSET_VERSION_CONFLICT")) {
    return {
      type: "https://docs.shiguanglab.com/problems/version-conflict",
      title: "版本冲突",
      status: 409,
      code: "ASSET_VERSION_CONFLICT",
      detail: "文档已在其他会话中被修改",
      instance: requestId ? `/requests/${requestId}` : undefined,
      requestId,
      recoveries: ["reload", "save_as_copy", "compare"],
    };
  }
  return {
    type: "about:blank",
    title: "Internal error",
    status: 500,
    code: "INTERNAL_ERROR",
    detail: "服务内部错误",
    instance: requestId ? `/requests/${requestId}` : undefined,
    requestId,
    recoveries: [],
  };
}
