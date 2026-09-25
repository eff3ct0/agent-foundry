import { serializeProvisioningProof } from "./resource-provisioning-proof.mjs";
import { readCleanupEligibility } from "./resource-cleanup-eligibility.mjs";

const MAX_PROOF_BYTES = 4096;
const MAX_ARTIFACT_BYTES = 1024;

export class ResourceProofCleanupError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const fail = (code: string, message: string): never => { throw new ResourceProofCleanupError(code, message); };

const proofFromEvidence = (serialized: unknown) => {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_PROOF_BYTES) return undefined;
  try {
    const proof: unknown = JSON.parse(serialized);
    return object(proof) && serializeProvisioningProof(proof) === serialized ? proof : undefined;
  } catch {
    return undefined;
  }
};

const artifact = ({ owner, target, runId, status, code }: {
  owner: unknown; target: unknown; runId: unknown; status: string; code?: string;
}) => ({
  schema_version: 1,
  owner,
  target,
  run_id: runId,
  status,
  ...(code ? { code } : {}),
});

const persist = async (store: { write(value: string): Promise<unknown> }, result: ReturnType<typeof artifact>) => {
  const serialized = `${JSON.stringify(result)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_ARTIFACT_BYTES) fail("artifact_too_large", "cleanup artifact exceeds its size limit");
  try {
    await store.write(serialized);
  } catch {
    fail("artifact_write_failed", "cleanup artifact could not be written");
  }
  return result;
};

const recovery = (input: { artifact: { write(value: string): Promise<unknown> }; owner: unknown; target: unknown; runId: unknown }, code?: string) =>
  persist(input.artifact, artifact({ ...input, status: "recovery-required", code }));

/**
 * Downloads one persisted proof, re-reads its exact target, and deletes only that target.
 */
export const cleanupProvisionedResource = async ({ evidence, artifact: artifactStore, readClient, mutationClient, owner, target, runId }: {
  evidence: unknown; artifact: unknown; readClient: unknown; mutationClient: unknown;
  owner: unknown; target: unknown; runId: unknown;
}) => {
  if (!object(evidence) || typeof evidence.download !== "function") fail("invalid_evidence", "cleanup evidence download is required");
  if (!object(artifactStore) || typeof artifactStore.write !== "function") fail("invalid_artifact", "cleanup artifact store is required");
  if (!object(readClient) || typeof readClient.get !== "function") fail("invalid_read_client", "hosted lifecycle read client is required");
  if (!object(mutationClient) || typeof mutationClient.deleteRepository !== "function") fail("invalid_mutation_client", "hosted lifecycle mutation client is required");

  const store = artifactStore as { write(value: string): Promise<unknown> };
  const input = { artifact: store, owner, target, runId };
  let serialized: unknown;
  try {
    serialized = await (evidence as { download(): Promise<unknown> }).download();
  } catch {
    return recovery(input, "proof_download_failed");
  }
  const proof = proofFromEvidence(serialized);
  if (!proof) return recovery(input, "proof_unavailable");

  const eligibility = await readCleanupEligibility({ client: readClient, owner, target, runId, proof });
  if (eligibility.status === "already-absent") return persist(store, artifact({ ...input, status: "already-absent" }));
  if (eligibility.status !== "eligible") return recovery(input, (eligibility as { code?: string }).code);

  const approved = eligibility as unknown as { recovery: { owner: string; proof: Record<string, unknown> } };
  let deletion: unknown;
  try {
    deletion = await (mutationClient as { deleteRepository(request: { owner: string; name: unknown }): Promise<unknown> })
      .deleteRepository({ owner: approved.recovery.owner, name: approved.recovery.proof.name });
  } catch {
    return recovery(input, "delete_indeterminate");
  }
  if (!object(deletion) || deletion.status !== "deleted") {
    return recovery(input, (deletion as { status?: unknown } | null | undefined)?.status === "indeterminate" ? "delete_indeterminate" : "delete_rejected");
  }
  return persist(store, artifact({ ...input, status: "deleted" }));
};
