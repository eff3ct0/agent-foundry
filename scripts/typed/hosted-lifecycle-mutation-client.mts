export const HOSTED_LIFECYCLE_ORIGIN = "https://api.github.com";
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_REQUEST_BYTES = 16 * 1024;
export const MAX_RESPONSE_BYTES = 64 * 1024;

export class HostedLifecycleMutationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const fail = (code: string, message: string): never => { throw new HostedLifecycleMutationError(code, message); };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const byteLength = (value: string) => Buffer.byteLength(value, "utf8");

const valid = (value: unknown, expression: RegExp, code: string, message: string): string => {
  if (typeof value !== "string" || !expression.test(value)) fail(code, message);
  return value as string;
};

type ResponseBody = { headers?: { get(name: string): string | null }; body?: ReadableStream<Uint8Array> };

const contentLength = (headers: ResponseBody["headers"]) => {
  const value = typeof headers?.get === "function" ? headers.get("content-length") : undefined;
  if (value === null || value === undefined || value === "") return undefined;
  if (!/^\d+$/u.test(value)) fail("invalid_response", "hosted lifecycle response is invalid");
  return Number(value);
};

const boundedBytes = async (response: ResponseBody) => {
  const declared = contentLength(response.headers);
  if (declared !== undefined && declared > MAX_RESPONSE_BYTES) fail("response_too_large", "hosted lifecycle response is too large");
  const reader = response.body?.getReader?.();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail("invalid_response", "hosted lifecycle response is invalid");
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        fail("response_too_large", "hosted lifecycle response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
};

const mutationResult = async (response: unknown, expectedStatus: number, expectedPayload: boolean) => {
  if (!object(response) || typeof response.status !== "number" || !Number.isInteger(response.status)) return { status: "rejected", code: "invalid_response" };
  if (response.status >= 500 && response.status <= 599) return { status: "indeterminate", code: "mutation_indeterminate" };
  if (response.status !== expectedStatus) return { status: "rejected", code: "mutation_rejected" };
  try {
    const bytes = await boundedBytes(response as ResponseBody);
    if (!expectedPayload) return bytes.length === 0 ? { status: "deleted" } : { status: "rejected", code: "invalid_response" };
    const payload: unknown = JSON.parse(bytes.toString("utf8"));
    return object(payload) ? { status: "created", payload } : { status: "rejected", code: "invalid_json" };
  } catch (error) {
    if (error instanceof HostedLifecycleMutationError) return { status: "rejected", code: error.code };
    return { status: "rejected", code: "invalid_json" };
  }
};

type Transport = (request: { method: string; url: string; headers: Record<string, string>; body: string | undefined; signal: AbortSignal }) => Promise<unknown>;

export const createHostedLifecycleMutationClient = ({ transport, token }: { transport: unknown; token: unknown }) => {
  if (typeof transport !== "function") fail("invalid_transport", "hosted lifecycle transport is required");
  if (typeof token !== "string" || !token || /[\0-\x1f\x7f]/u.test(token)) fail("invalid_token", "hosted lifecycle token is invalid");

  const mutate = async ({ method, endpoint, payload, expectedStatus, expectedPayload }: {
    method: string; endpoint: string; payload?: unknown; expectedStatus: number; expectedPayload: boolean;
  }) => {
    const url = new URL(endpoint, HOSTED_LIFECYCLE_ORIGIN);
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    };
    const serialized = `${method} ${url}\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\n")}${body === undefined ? "" : `\n\n${body}`}`;
    if (byteLength(serialized) > MAX_REQUEST_BYTES) fail("request_too_large", "hosted lifecycle request is too large");
    try {
      return await mutationResult(await (transport as Transport)({ method, url: url.toString(), headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }), expectedStatus, expectedPayload);
    } catch {
      return { status: "indeterminate", code: "mutation_indeterminate" };
    }
  };

  return {
    async createTemplateRepository({ template, owner, name }: { template: unknown; owner: unknown; name: unknown }) {
      template = valid(template, REPOSITORY, "invalid_template", "template identifier is invalid");
      owner = valid(owner, OWNER, "invalid_owner", "repository owner is invalid");
      name = valid(name, NAME, "invalid_name", "repository name is invalid");
      return mutate({
        method: "POST",
        endpoint: `/repos/${template}/generate`,
        payload: { owner, name, private: true, include_all_branches: false },
        expectedStatus: 201,
        expectedPayload: true,
      });
    },
    async createEmptyRepository({ owner, name }: { owner: unknown; name: unknown }) {
      owner = valid(owner, OWNER, "invalid_owner", "repository owner is invalid");
      name = valid(name, NAME, "invalid_name", "repository name is invalid");
      return mutate({
        method: "POST",
        endpoint: `/orgs/${owner}/repos`,
        payload: { name, private: true, auto_init: false, has_issues: true, has_projects: false, has_wiki: false },
        expectedStatus: 201,
        expectedPayload: true,
      });
    },
    async deleteRepository({ owner, name }: { owner: unknown; name: unknown }) {
      owner = valid(owner, OWNER, "invalid_owner", "repository owner is invalid");
      name = valid(name, NAME, "invalid_name", "repository name is invalid");
      return mutate({ method: "DELETE", endpoint: `/repos/${owner}/${name}`, expectedStatus: 204, expectedPayload: false });
    },
  };
};
