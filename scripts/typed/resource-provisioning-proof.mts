const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const RUN_ID = /^[0-9]{1,20}$/u;
const RESOURCE = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/u;
const VISIBILITIES = new Set(["private", "public", "internal"]);

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const rejected = (code: string) => ({ status: "rejected" as const, code });
const indeterminate = () => ({ status: "indeterminate" as const, code: "read_indeterminate" });

export class ResourceProvisioningProofError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const validate = (value: unknown, expression: RegExp, code: string, message: string): string => {
  if (typeof value !== "string" || !expression.test(value)) throw new ResourceProvisioningProofError(code, message);
  return value;
};

const releaseSha = (value: unknown) => {
  const sha = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SHA.test(sha)) throw new ResourceProvisioningProofError("invalid_release_sha", "release SHA must be a full immutable commit");
  return sha;
};

const read = async (client: { get(endpoint: string): Promise<unknown> }, endpoint: string) => {
  let result: unknown;
  try {
    result = await client.get(endpoint);
  } catch {
    return indeterminate();
  }
  if (!object(result) || result.status === "indeterminate") return indeterminate();
  if (result.status !== "ok" || !object(result.payload)) return rejected("read_rejected");
  return { status: "ok" as const, payload: result.payload };
};

export const canonicalResourceName = ({ runId, resource }: { runId: unknown; resource: unknown }) => {
  runId = validate(runId, RUN_ID, "invalid_run_id", "run ID must be numeric");
  resource = validate(resource, RESOURCE, "invalid_resource", "resource name is invalid");
  return `bootstrap-e2e-${runId}-${resource}`;
};

const repositoryProof = ({ runId, owner, name, visibility, template, releaseSha: sha, details, branch }: {
  runId: string; owner: string; name: string; visibility: string; template: string;
  releaseSha: string; details: Record<string, unknown>; branch: string;
}) => ({
  schema_version: 1,
  status: "verified",
  run_id: runId,
  owner,
  name,
  full_name: `${owner}/${name}`,
  repository_id: details.id,
  visibility,
  template,
  release_sha: sha,
  default_branch: branch,
});

export const serializeProvisioningProof = (proof: Record<string, unknown>) => `${JSON.stringify({
  schema_version: proof.schema_version,
  status: proof.status,
  run_id: proof.run_id,
  owner: proof.owner,
  name: proof.name,
  full_name: proof.full_name,
  repository_id: proof.repository_id,
  visibility: proof.visibility,
  template: proof.template,
  release_sha: proof.release_sha,
  default_branch: proof.default_branch,
})}\n`;

export const proveProvisionedResource = async ({ client, runId, owner, resource, visibility = "private", template, releaseSha: expectedSha }: {
  client: unknown; runId: unknown; owner: unknown; resource: unknown; visibility?: unknown;
  template: unknown; releaseSha: unknown;
}) => {
  if (!object(client) || typeof client.get !== "function") throw new ResourceProvisioningProofError("invalid_client", "hosted lifecycle read client is required");
  const verifiedRunId = validate(runId, RUN_ID, "invalid_run_id", "run ID must be numeric");
  const verifiedOwner = validate(owner, OWNER, "invalid_owner", "resource owner is invalid");
  const name = canonicalResourceName({ runId: verifiedRunId, resource });
  const verifiedVisibility = validate(visibility, /^(?:private|public|internal)$/u, "invalid_visibility", "resource visibility is invalid");
  const verifiedTemplate = validate(template, REPOSITORY, "invalid_template", "template identifier is invalid");
  const verifiedSha = releaseSha(expectedSha);

  const repository = await read(client as { get(endpoint: string): Promise<unknown> }, `/repos/${verifiedOwner}/${name}`);
  if (repository.status !== "ok") return repository;
  const details = repository.payload;
  if (details.full_name !== `${verifiedOwner}/${name}` || details.name !== name) return rejected("resource_name_mismatch");
  if (!object(details.owner) || details.owner.login !== verifiedOwner) return rejected("resource_owner_mismatch");
  if (typeof details.id !== "number" || !Number.isSafeInteger(details.id) || details.id <= 0) return rejected("repository_id_mismatch");
  if (details.visibility !== verifiedVisibility || !VISIBILITIES.has(verifiedVisibility)) return rejected("resource_visibility_mismatch");
  if (!object(details.template_repository) || details.template_repository.full_name !== verifiedTemplate) return rejected("resource_template_mismatch");
  if (typeof details.default_branch !== "string" || !BRANCH.test(details.default_branch)) return rejected("resource_branch_mismatch");

  const branch = details.default_branch;
  const reference = await read(client as { get(endpoint: string): Promise<unknown> }, `/repos/${verifiedOwner}/${name}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (reference.status !== "ok") return reference;
  const target = object(reference.payload.object) ? reference.payload.object : undefined;
  if (!target || target.type !== "commit" || target.sha !== verifiedSha) return rejected("resource_release_sha_mismatch");
  return repositoryProof({ runId: verifiedRunId, owner: verifiedOwner, name, visibility: verifiedVisibility, template: verifiedTemplate, releaseSha: verifiedSha, details, branch });
};
