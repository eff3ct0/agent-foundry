export const HOSTED_LIFECYCLE_ORIGIN = "https://api.github.com";
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_REQUEST_BYTES = 16 * 1024;
export const MAX_RESPONSE_BYTES = 64 * 1024;

export class HostedLifecycleReadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => { throw new HostedLifecycleReadError(code, message); };
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const byteLength = (value) => Buffer.byteLength(value, "utf8");

const endpointUrl = (endpoint) => {
  if (typeof endpoint !== "string" || !endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.includes("#") || /[\0-\x1f\x7f\\]/u.test(endpoint)) {
    fail("invalid_endpoint", "hosted lifecycle endpoint is invalid");
  }
  const path = endpoint.split(/[?#]/u, 1)[0];
  try {
    if (path.split("/").some((segment) => [".", ".."].includes(decodeURIComponent(segment)))) {
      fail("invalid_endpoint", "hosted lifecycle endpoint is invalid");
    }
    const url = new URL(endpoint, HOSTED_LIFECYCLE_ORIGIN);
    if (url.origin !== HOSTED_LIFECYCLE_ORIGIN || url.pathname !== path) fail("invalid_endpoint", "hosted lifecycle endpoint is invalid");
    return url;
  } catch (error) {
    if (error instanceof HostedLifecycleReadError) throw error;
    fail("invalid_endpoint", "hosted lifecycle endpoint is invalid");
  }
};

const contentLength = (headers) => {
  const value = typeof headers?.get === "function" ? headers.get("content-length") : undefined;
  if (value === null || value === undefined || value === "") return undefined;
  if (!/^\d+$/u.test(value)) fail("invalid_response", "hosted lifecycle response is invalid");
  return Number(value);
};

const boundedJson = async (response) => {
  const declared = contentLength(response.headers);
  if (declared !== undefined && declared > MAX_RESPONSE_BYTES) fail("response_too_large", "hosted lifecycle response is too large");
  const reader = response.body?.getReader?.();
  if (!reader) fail("invalid_response", "hosted lifecycle response is invalid");
  const chunks = [];
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
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!object(payload)) fail("invalid_json", "hosted lifecycle JSON response is invalid");
    return payload;
  } catch (error) {
    if (error instanceof HostedLifecycleReadError) throw error;
    fail("invalid_json", "hosted lifecycle JSON response is invalid");
  }
};

export const createHostedLifecycleReadClient = ({ transport, token }) => {
  if (typeof transport !== "function") fail("invalid_transport", "hosted lifecycle transport is required");
  if (typeof token !== "string" || !token || /[\0-\x1f\x7f]/u.test(token)) fail("invalid_token", "hosted lifecycle token is invalid");
  return {
    async get(endpoint) {
      const url = endpointUrl(endpoint);
      const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
      if (byteLength(`GET ${url}\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("\n")}`) > MAX_REQUEST_BYTES) {
        fail("request_too_large", "hosted lifecycle request is too large");
      }
      let response;
      try {
        response = await transport({ method: "GET", url: url.toString(), headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch {
        return { status: "indeterminate", code: "read_indeterminate" };
      }
      if (!object(response) || !Number.isInteger(response.status)) return { status: "rejected", code: "invalid_response" };
      if (response.status === 404) return { status: "missing" };
      if (response.status >= 500 && response.status <= 599) return { status: "indeterminate", code: "read_indeterminate" };
      if (response.status < 200 || response.status > 299) return { status: "rejected", code: "read_rejected" };
      try {
        return { status: "ok", payload: await boundedJson(response) };
      } catch (error) {
        if (error instanceof HostedLifecycleReadError) return { status: "rejected", code: error.code };
        return { status: "indeterminate", code: "read_indeterminate" };
      }
    },
  };
};
