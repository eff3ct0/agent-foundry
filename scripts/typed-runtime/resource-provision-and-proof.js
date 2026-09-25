import { canonicalResourceName, proveProvisionedResource, serializeProvisioningProof, } from "./resource-provisioning-proof.js";
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/u;
const MAX_PROOF_BYTES = 4096;
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const recoveryRequired = (code) => ({ status: "recovery-required", code });
export class ResourceProvisionAndProofError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
const validate = (value, expression, code, message) => {
    if (typeof value !== "string" || !expression.test(value))
        throw new ResourceProvisionAndProofError(code, message);
    return value;
};
const expectedProof = ({ runId, owner, name, template, releaseSha }) => ({
    schema_version: 1,
    status: "verified",
    run_id: runId,
    owner,
    name,
    full_name: `${owner}/${name}`,
    visibility: "private",
    template,
    release_sha: releaseSha,
});
export const validatePersistedProvisioningProof = ({ serialized, runId, owner, resource, template, releaseSha }) => {
    const name = canonicalResourceName({ runId, resource });
    const validatedOwner = validate(owner, OWNER, "invalid_owner", "resource owner is invalid");
    const validatedTemplate = validate(template, REPOSITORY, "invalid_template", "template identifier is invalid");
    const normalizedSha = typeof releaseSha === "string" ? releaseSha.trim().toLowerCase() : "";
    const validatedSha = validate(normalizedSha, SHA, "invalid_release_sha", "release SHA must be a full immutable commit");
    if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_PROOF_BYTES)
        return undefined;
    let proof;
    try {
        proof = JSON.parse(serialized);
    }
    catch {
        return undefined;
    }
    if (!object(proof) || serializeProvisioningProof(proof) !== serialized || !Number.isSafeInteger(proof.repository_id)
        || proof.repository_id <= 0 || typeof proof.default_branch !== "string" || !BRANCH.test(proof.default_branch))
        return undefined;
    return Object.entries(expectedProof({ runId, owner: validatedOwner, name, template: validatedTemplate, releaseSha: validatedSha }))
        .every(([key, value]) => proof[key] === value) ? proof : undefined;
};
const created = (result) => object(result) && result.status === "created";
/**
 * Creates exactly one canonical disposable repository. Its F3 proof is persisted and read back before validation.
 */
export const provisionAndProve = async ({ mutationClient, proofClient, proofStore, runId, owner, resource, template, releaseSha }) => {
    if (!object(mutationClient) || typeof mutationClient.createTemplateRepository !== "function") {
        throw new ResourceProvisionAndProofError("invalid_mutation_client", "hosted lifecycle mutation client is required");
    }
    if (!object(proofClient) || typeof proofClient.get !== "function") {
        throw new ResourceProvisionAndProofError("invalid_proof_client", "hosted lifecycle read client is required");
    }
    if (!object(proofStore) || typeof proofStore.write !== "function" || typeof proofStore.read !== "function") {
        throw new ResourceProvisionAndProofError("invalid_proof_store", "proof store is required");
    }
    const name = canonicalResourceName({ runId, resource });
    const validatedOwner = validate(owner, OWNER, "invalid_owner", "resource owner is invalid");
    const validatedTemplate = validate(template, REPOSITORY, "invalid_template", "template identifier is invalid");
    const normalizedSha = typeof releaseSha === "string" ? releaseSha.trim().toLowerCase() : "";
    const validatedSha = validate(normalizedSha, SHA, "invalid_release_sha", "release SHA must be a full immutable commit");
    let result;
    try {
        result = await mutationClient.createTemplateRepository({ template: validatedTemplate, owner: validatedOwner, name });
    }
    catch {
        return { status: "indeterminate", code: "mutation_indeterminate" };
    }
    if (!created(result))
        return object(result) && result.status === "rejected"
            ? { status: "rejected", code: typeof result.code === "string" ? result.code : "mutation_rejected" }
            : { status: "indeterminate", code: "mutation_indeterminate" };
    const proof = await proveProvisionedResource({ client: proofClient, runId, owner: validatedOwner, resource, template: validatedTemplate, releaseSha: validatedSha });
    if (proof.status !== "verified")
        return proof;
    const store = proofStore;
    try {
        await store.write(serializeProvisioningProof(proof));
    }
    catch {
        return recoveryRequired("proof_persistence_failed");
    }
    let serialized;
    try {
        serialized = await store.read();
    }
    catch {
        return recoveryRequired("proof_persistence_failed");
    }
    const persisted = validatePersistedProvisioningProof({ serialized, runId, owner: validatedOwner, resource, template: validatedTemplate, releaseSha: validatedSha });
    return persisted ? { status: "verified", proof: persisted } : recoveryRequired("proof_validation_failed");
};
