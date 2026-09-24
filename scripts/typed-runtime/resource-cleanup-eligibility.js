const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u;
const RUN_ID = /^[0-9]{1,20}$/u;
const TARGET = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,99}$/u;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/u;
const VISIBILITIES = new Set(["private", "public", "internal"]);
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const recoveryRequired = (code) => ({ status: "recovery-required", code });
const scope = ({ owner, target, runId, proof }) => {
    if (typeof owner !== "string" || !OWNER.test(owner)
        || typeof runId !== "string" || !RUN_ID.test(runId)
        || typeof target !== "string" || !TARGET.test(target)
        || !object(proof))
        return undefined;
    const resourceName = new RegExp(`^bootstrap-e2e-${runId}-[a-z0-9][a-z0-9-]{0,63}$`, "u");
    if (typeof proof.name !== "string" || !resourceName.test(proof.name)
        || target !== `${owner}/${proof.name}`)
        return undefined;
    if (proof.schema_version !== 1 || proof.status !== "verified"
        || proof.run_id !== runId || proof.owner !== owner
        || proof.full_name !== target || typeof proof.repository_id !== "number" || !Number.isSafeInteger(proof.repository_id)
        || proof.repository_id <= 0 || typeof proof.visibility !== "string" || !VISIBILITIES.has(proof.visibility)
        || typeof proof.template !== "string" || !REPOSITORY.test(proof.template)
        || typeof proof.release_sha !== "string" || !SHA.test(proof.release_sha)
        || typeof proof.default_branch !== "string" || !BRANCH.test(proof.default_branch))
        return undefined;
    return { owner, target, runId, proof: { ...proof } };
};
const exactReadback = (readback, context) => {
    if (!object(readback))
        return "readback_malformed";
    if (readback.id !== context.proof.repository_id)
        return "repository_id_changed";
    if (readback.full_name !== context.target)
        return "resource_name_changed";
    if (!object(readback.owner) || readback.owner.login !== context.owner)
        return "resource_owner_changed";
    if (readback.name !== context.proof.name)
        return "resource_name_changed";
    if (readback.visibility !== context.proof.visibility || typeof readback.visibility !== "string" || !VISIBILITIES.has(readback.visibility))
        return "resource_visibility_changed";
    if (!object(readback.template_repository) || readback.template_repository.full_name !== context.proof.template)
        return "resource_template_changed";
    return undefined;
};
const eligible = (context) => ({
    status: "eligible",
    recovery: {
        owner: context.owner,
        target: context.target,
        run_id: context.runId,
        proof: context.proof,
    },
});
/**
 * Decides whether one exact resource may be recovered. It never lists or mutates resources.
 */
export const decideCleanupEligibility = ({ owner, target, runId, proof, readback }) => {
    const context = scope({ owner, target, runId, proof });
    if (!context)
        return recoveryRequired("proof_scope_mismatch");
    if (readback === null)
        return { status: "already-absent" };
    const mismatch = exactReadback(readback, context);
    return mismatch ? recoveryRequired(mismatch) : eligible(context);
};
/**
 * Performs one exact hosted read, then returns only evidence for an exact recovery.
 */
export const readCleanupEligibility = async ({ client, owner, target, runId, proof }) => {
    const context = scope({ owner, target, runId, proof });
    if (!context)
        return recoveryRequired("proof_scope_mismatch");
    if (!object(client) || typeof client.get !== "function")
        return recoveryRequired("read_client_invalid");
    let result;
    try {
        result = await client.get(`/repos/${context.target}`);
    }
    catch {
        return recoveryRequired("read_indeterminate");
    }
    if (!object(result))
        return recoveryRequired("readback_malformed");
    if (result.status === "missing")
        return { status: "already-absent" };
    if (result.status !== "ok")
        return recoveryRequired("read_indeterminate");
    return decideCleanupEligibility({ ...context, readback: result.payload });
};
