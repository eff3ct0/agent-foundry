import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";

import { INITIALIZER_NAME, NpmReleaseError, npmCommand, probeExactVersion, publishPair, readPackageIdentity, registryReadback, releasePair, validateRegistryReadback, validateReleaseIdentity } from "../scripts/npm-release.mjs";

const execFile = promisify(execFileCallback);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSha = "a".repeat(40);
const packageName = "@eff3ct/agent-foundry";
const version = "0.1.0";
const packageUrl = "https://registry.npmjs.org/@eff3ct%2fagent-foundry";
const exactUrl = `${packageUrl}/${version}`;
const identity = { name: packageName, version };
const response = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const fakeTransport = (exact, document, requests) => async (request) => {
  requests.push(request);
  assert.equal(request.headers.Accept, "application/json");
  assert.equal(request.redirect, "error");
  return request.url === exactUrl ? exact : request.url === packageUrl ? document : assert.fail("unexpected registry URL");
};

test("exact npm version probe observes only two fixed-origin read endpoints", async () => {
  const cases = [
    ["both missing", response(404), response(404), "absent"],
    ["package without version", response(404), response(200, { name: packageName, versions: {} }), "absent"],
    ["both agree", response(200, identity), response(200, { name: packageName, versions: { [version]: identity } }), "present"],
    ["exact version appears between reads", response(404), response(200, { name: packageName, versions: { [version]: identity } }), "unknown"],
    ["exact version disappears between reads", response(200, identity), response(404), "unknown"],
    ["package document omits exact version", response(200, identity), response(200, { name: packageName, versions: {} }), "unknown"],
    ["malformed document", response(404), response(200, { name: packageName }), "unknown"],
    ["malformed JSON", new Response("{invalid", { status: 200 }), response(404), "unknown"],
    ["wrong document package", response(404), response(200, { name: "other", versions: {} }), "unknown"],
    ["wrong exact package", response(200, { name: "other", version }), response(200, { name: packageName, versions: { [version]: identity } }), "unknown"],
    ["wrong document version", response(200, identity), response(200, { name: packageName, versions: { [version]: { name: packageName, version: "0.2.0" } } }), "unknown"],
    ["unauthorized", response(401), response(404), "unknown"],
    ["forbidden", response(403), response(404), "unknown"],
    ["server failure", response(503), response(404), "unknown"],
    ["package document failure", response(404), response(500), "unknown"],
  ];
  for (const [label, exact, document, status] of cases) {
    const requests = [];
    assert.deepEqual(await probeExactVersion({ packageName, version, transport: fakeTransport(exact, document, requests) }), { status }, label);
    assert.deepEqual(requests.map(({ url }) => url), [401, 403, 503].includes(exact.status) || label === "malformed JSON" ? [exactUrl] : [exactUrl, packageUrl], label);
  }
});

test("exact npm version probe rejects target mismatch without network and fails closed on transport failures", async () => {
  let calls = 0;
  const transport = async () => { calls += 1; throw new Error("private credential must not be printed"); };
  assert.deepEqual(await probeExactVersion({ packageName: "@other/package", version, transport }), { status: "unknown" });
  assert.deepEqual(await probeExactVersion({ packageName, version: "latest", transport }), { status: "unknown" });
  assert.equal(calls, 0);
  assert.deepEqual(await probeExactVersion({ packageName, version, transport }), { status: "unknown" });
  assert.equal(calls, 1);
  assert.deepEqual(await probeExactVersion({ packageName, version, timeoutMs: 10, transport: () => new Promise(() => {}) }), { status: "unknown" });
  const requests = [];
  const oversized = response(200, { name: packageName, version, extra: "x".repeat(65 * 1024) });
  assert.deepEqual(await probeExactVersion({ packageName, version, transport: fakeTransport(oversized, response(404), requests) }), { status: "unknown" });
  assert.equal(requests.length, 1);
});

test("initializer exact probe uses only its fixed npm endpoints and fails closed on inconsistency", async () => {
  const url = "https://registry.npmjs.org/@eff3ct%2fcreate-agent-foundry";
  for (const [exact, document, status] of [
    [response(404), response(404), "absent"],
    [response(200, { name: INITIALIZER_NAME, version }), response(200, { name: INITIALIZER_NAME, versions: { [version]: { name: INITIALIZER_NAME, version } } }), "present"],
    [response(404), response(200, { name: INITIALIZER_NAME, versions: { [version]: { name: INITIALIZER_NAME, version } } }), "unknown"],
  ]) {
    const requests = [];
    const outcome = await probeExactVersion({ packageName: INITIALIZER_NAME, version, transport: async (request) => {
      requests.push(request.url);
      return request.url === `${url}/${version}` ? exact : request.url === url ? document : assert.fail("unexpected URL");
    } });
    assert.equal(outcome.status, status);
    assert.deepEqual(requests, [`${url}/${version}`, url]);
  }
});

test("release identity requires the exact v<package-version> tag and source revision", () => {
  assert.deepEqual(validateReleaseIdentity("v0.1.0", "0.1.0", sourceSha), { tag: "v0.1.0", sha: sourceSha });
  assert.throws(() => validateReleaseIdentity("v0.1.1", "0.1.0", sourceSha), /release tag/u);
  assert.throws(() => validateReleaseIdentity("v0.1.0", "0.1.0", "not-a-sha"), /source revision/u);
});

test("local and registry identities require matching package, payload, and tarball bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "npm-release-contract-"));
  try {
    await cp(path.join(root, "package.json"), path.join(directory, "package.json"));
    await cp(path.join(root, "dist"), path.join(directory, "dist"), { recursive: true });
    const tarball = path.join(directory, "package.tgz");
    await writeFile(tarball, "exact-package-bytes\n");
    const expected = await readPackageIdentity({ packageRoot: directory, tarballPath: tarball, tag: "v0.2.0", sourceSha });
    const registry = structuredClone(expected);
    const verified = validateRegistryReadback({ metadata: expected.package, registryIdentity: registry, expected });
    assert.equal(verified.status, "verified");
    assert.throws(() => validateRegistryReadback({ metadata: expected.package, registryIdentity: { ...registry, release: { ...registry.release, sha: "b".repeat(40) } }, expected }), /registry release SHA/u);
    assert.throws(() => validateRegistryReadback({ metadata: expected.package, registryIdentity: { ...registry, release: undefined }, expected }), /registry release SHA/u);
    assert.throws(() => validateRegistryReadback({ metadata: expected.package, registryIdentity: { ...registry, tarball_digest: "sha256:" + "0".repeat(64) }, expected }), /tarball identity/u);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")).name, "@eff3ct/agent-foundry");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("initializer staging and registry metadata bind the exact dependency and tarball", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "npm-initializer-release-"));
  try {
    await cp(path.join(root, "initializer", "package.json"), path.join(directory, "package.json"));
    await mkdir(path.join(directory, "bin"));
    await cp(path.join(root, "initializer", "bin", "create-agent-foundry.cjs"), path.join(directory, "bin", "create-agent-foundry.cjs"));
    await writeFile(path.join(directory, "package.tgz"), "initializer bytes");
    const options = { packageRoot: directory, tarballPath: path.join(directory, "package.tgz"), tag: "v0.2.0", sourceSha, packageName: INITIALIZER_NAME };
    const staged = await readPackageIdentity(options);
    const metadata = { ...staged.package, dependencies: staged.dependency };
    assert.equal(validateRegistryReadback({ metadata, registryIdentity: staged, expected: staged }).status, "verified");
    assert.throws(() => validateRegistryReadback({ metadata: { ...metadata, dependencies: { [packageName]: "0.2.0-rc.0" } }, registryIdentity: staged, expected: staged }), /initializer dependency/u);
    assert.throws(() => validateRegistryReadback({ metadata, registryIdentity: { ...staged, tarball_digest: "sha256:" + "0".repeat(64) }, expected: staged }), /tarball identity/u);
    const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    manifest.dependencies[packageName] = "^0.2.0";
    await writeFile(path.join(directory, "package.json"), JSON.stringify(manifest));
    await assert.rejects(readPackageIdentity(options), /exact creator version/u);
    manifest.dependencies[packageName] = "0.2.0";
    await writeFile(path.join(directory, "package.json"), JSON.stringify(manifest));
    await rm(path.join(directory, "bin", "create-agent-foundry.cjs"));
    await assert.rejects(readPackageIdentity(options), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("pair coordinator probes both, verifies present bytes, and never resumes a partial pair", async () => {
  const creator = { package: { name: packageName, version }, release: { tag: `v${version}`, sha: sourceSha }, tarball_digest: "sha256:" + "a".repeat(64) };
  const initializer = { package: { name: INITIALIZER_NAME, version }, release: creator.release, dependency: { [packageName]: version }, tarball_digest: "sha256:" + "b".repeat(64) };
  const run = async (states, overrides = {}) => {
    const calls = [];
    const outcome = releasePair({ identities: [creator, initializer],
      probe: async (item) => { calls.push(`probe:${item.package.name}`); return { status: states.shift() }; },
      claim: async () => { calls.push("claim"); return { status: overrides.claim ?? "claimed" }; },
      publish: async (item) => { calls.push(`publish:${item.package.name}`); if (overrides.failPublish === item.package.name) throw new Error("private npm token"); },
      readback: async (item) => { calls.push(`readback:${item.package.name}`); if (overrides.failReadback === item.package.name) throw new Error("mismatched bytes"); },
      record: async (state) => { calls.push(`state:${state}`); },
    });
    return { calls, outcome };
  };
  for (const states of [["unknown", "absent"], ["absent", "unknown"], ["present", "absent"], ["absent", "present"]]) {
    const { calls, outcome } = await run([...states]);
    await assert.rejects(outcome);
    assert.equal(calls.some((call) => call.startsWith("publish:") || call === "claim"), false);
  }
  const existing = await run(["present", "present"]);
  assert.equal(await existing.outcome, "verified_existing_pair");
  assert.equal(existing.calls.includes("claim"), false);
  const mismatched = await run(["present", "present"], { failReadback: INITIALIZER_NAME });
  await assert.rejects(mismatched.outcome, /mismatched bytes/u);
  assert.equal(mismatched.calls.includes("claim"), false);
  const rejected = await run(["absent", "absent"], { claim: "blocked" });
  await assert.rejects(rejected.outcome, /claim_not_granted/u);
  assert.equal(rejected.calls.some((call) => call.startsWith("publish:")), false);
  const success = await run(["absent", "absent"]);
  assert.equal(await success.outcome, "verified_new_pair");
  assert.deepEqual(success.calls.filter((call) => call.startsWith("publish:") || call.startsWith("readback:")), [
    `publish:${packageName}`, `readback:${packageName}`, `publish:${INITIALIZER_NAME}`, `readback:${INITIALIZER_NAME}`,
  ]);
  for (const options of [{ failPublish: INITIALIZER_NAME }, { failReadback: INITIALIZER_NAME }, { failReadback: packageName }]) {
    const partial = await run(["absent", "absent"], options);
    await assert.rejects(partial.outcome);
    assert.equal(partial.calls.filter((call) => call === "claim").length, 1);
    assert.equal(partial.calls.filter((call) => call === `publish:${INITIALIZER_NAME}`).length, options.failReadback === packageName ? 0 : 1);
  }
  await assert.rejects(releasePair({ identities: [creator, { ...initializer, dependency: { [packageName]: "^0.1.0" } }] }), /pair_identity_mismatch/u);
});

test("release runner refuses changed staged bytes before any registry or claim operation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "npm-pair-preflight-"));
  const original = Object.fromEntries(["RELEASE_TAG", "RELEASE_SHA", "VERSION", "TARBALL", "INITIALIZER_TARBALL"].map((key) => [key, process.env[key]]));
  try {
    await mkdir(path.join(directory, "local-package"));
    await mkdir(path.join(directory, "local-initializer"));
    await cp(path.join(root, "package.json"), path.join(directory, "local-package", "package.json"));
    await cp(path.join(root, "dist"), path.join(directory, "local-package", "dist"), { recursive: true });
    await cp(path.join(root, "initializer", "package.json"), path.join(directory, "local-initializer", "package.json"));
    await mkdir(path.join(directory, "local-initializer", "bin"));
    await cp(path.join(root, "initializer", "bin", "create-agent-foundry.cjs"), path.join(directory, "local-initializer", "bin", "create-agent-foundry.cjs"));
    await mkdir(path.join(directory, "package"));
    await mkdir(path.join(directory, "identity"));
    for (const [name, folder, packageName] of [["local", "local-package", "@eff3ct/agent-foundry"], ["initializer", "local-initializer", INITIALIZER_NAME]]) {
      const tarball = `./package/${name}.tgz`;
      await writeFile(path.join(directory, tarball), `${name} bytes`);
      const staged = await readPackageIdentity({ packageRoot: path.join(directory, folder), tarballPath: path.join(directory, tarball), tag: "v0.2.0", sourceSha, packageName });
      await writeFile(path.join(directory, "identity", `${name}.json`), JSON.stringify(staged));
    }
    Object.assign(process.env, { RELEASE_TAG: "v0.2.0", RELEASE_SHA: sourceSha, VERSION: "0.2.0", TARBALL: "./package/local.tgz", INITIALIZER_TARBALL: "./package/initializer.tgz" });
    await writeFile(path.join(directory, "package", "initializer.tgz"), "changed bytes");
    await assert.rejects(publishPair(directory), { code: "staged_bytes_changed" });
    await assert.rejects(readFile(path.join(directory, "identity", "pair-state.json")), { code: "ENOENT" });
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});

test("initializer registry readback retries only bounded reads, then verifies immutable bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "npm-pair-readback-"));
  try {
    const packageRoot = path.join(directory, "archive", "package");
    await mkdir(packageRoot, { recursive: true });
    await cp(path.join(root, "initializer", "package.json"), path.join(packageRoot, "package.json"));
    await mkdir(path.join(packageRoot, "bin"));
    await cp(path.join(root, "initializer", "bin", "create-agent-foundry.cjs"), path.join(packageRoot, "bin", "create-agent-foundry.cjs"));
    const archive = path.join(directory, "initializer.tgz");
    await execFile("tar", ["-czf", archive, "-C", path.join(directory, "archive"), "package"]);
    const expected = await readPackageIdentity({ packageRoot, tarballPath: archive, tag: "v0.2.0", sourceSha, packageName: INITIALIZER_NAME });
    const metadata = { ...expected.package, dependencies: expected.dependency };
    const waits = [];
    let views = 0;
    const npm = async (args) => {
      if (args[0] === "view") {
        views += 1;
        if (views < 3) throw new NpmReleaseError("registry_read_unavailable");
        return JSON.stringify(metadata);
      }
      assert.equal(args[0], "pack");
      await cp(archive, path.join(args.at(-1), "initializer.tgz"));
      return "";
    };
    const verified = await registryReadback(expected, directory, directory, { npm, wait: async (ms) => { waits.push(ms); } });
    assert.equal(verified, undefined);
    assert.equal(views, 3);
    assert.deepEqual(waits, [5000, 10000]);
    assert.equal(JSON.parse(await readFile(path.join(directory, "registry-initializer.json"), "utf8")).status, "verified");
    const missing = async () => { throw new NpmReleaseError("registry_read_unavailable"); };
    const delays = [];
    await assert.rejects(registryReadback(expected, directory, directory, { npm: missing, wait: async (ms) => { delays.push(ms); } }), { code: "registry_read_unavailable" });
    assert.deepEqual(delays, [5000, 10000, 15000, 20000]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const privateText = "npm_PRIVATE_SENTINEL /home/private-user/.npmrc https://user:secret@example.invalid email@example.invalid";
const assertPrivate = (error) => {
  assert.equal(error.message, error.code);
  assert.equal(error.cause, undefined);
  for (const value of [error.message, JSON.stringify(error)]) {
    for (const sentinel of privateText.split(" ")) assert.equal(value.includes(sentinel), false);
  }
};

test("npm adapter maps real child exit, spawn, termination and buffer failures for view and pack", async () => {
  const cases = [
    ["exit", ["-e", `process.stdout.write(${JSON.stringify(privateText)}); process.stderr.write("npm error code E401\\n"); process.exit(7)`], {}, { exit_code: 7, npm_code: "E401", killed: false }],
    ["spawn", [], {}, { system_code: "ENOENT" }],
    ["termination", ["-e", "setTimeout(() => {}, 1000)"], { timeout: 50 }, { signal: "SIGTERM", killed: true }],
    ["buffer", ["-e", "process.stdout.write('x'.repeat(128))"], { maxBuffer: 32 }, { system_code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }],
  ];
  for (const operation of ["view", "pack"]) {
    for (const [label, childArgs, limits, expected] of cases) {
      await assert.rejects(npmCommand([operation, privateText], root, false, {
        execute: async (file, args, options) => {
          assert.equal(file, "npm");
          assert.deepEqual(args, [operation, privateText]);
          assert.equal(options.timeout, 30000);
          assert.equal(options.maxBuffer, 64 * 1024);
          assert.equal(Object.hasOwn(options.env, "NODE_AUTH_TOKEN"), false);
          // Run a local child, never npm; do not pass ambient credentials to the fixture.
          try {
            return await execFile(label === "spawn" ? path.join(root, "missing-private-npm") : process.execPath,
              childArgs, { cwd: options.cwd, env: { PRIVATE_TEST_VALUE: privateText }, ...limits });
          } catch (error) {
            error.cause = new Error(privateText);
            error.env = { PRIVATE_TEST_VALUE: privateText };
            throw error;
          }
        },
      }), (error) => {
        assert.ok(error instanceof NpmReleaseError);
        assert.equal(error.code, "registry_read_unavailable");
        assert.equal(error.diagnostic.operation, operation);
        for (const [key, value] of Object.entries(expected)) assert.equal(error.diagnostic[key], value, label);
        assertPrivate(error);
        return true;
      });
    }
  }
});

test("npm diagnostic allowlists reject unknown, stringly and oversized output without copying raw fields", async () => {
  for (const raw of [undefined, null, privateText, 7, {
    code: privateText, signal: privateText, killed: "true", stdout: privateText,
    stderr: `npm error code E_PRIVATE_SENTINEL\nnpm error code E401_${privateText}\n`,
    message: privateText, stack: privateText, cause: { password: privateText },
  }, { code: "7", signal: "sigterm", stderr: Buffer.from(privateText) }, {
    code: 256, stderr: `${"x".repeat(64 * 1024)}\nnpm error code E401\n`,
  }]) {
    await assert.rejects(npmCommand([privateText], root, false, { execute: async () => { throw raw; } }), (error) => {
      assert.deepEqual(error.diagnostic, { operation: "unknown" });
      assertPrivate(error);
      return true;
    });
  }
  await assert.rejects(npmCommand(["view"], root, false, { execute: async () => {
    throw { code: 1, stderr: `npm ERR! code UNKNOWN_SECRET\nnpm ERR! code E404\n${privateText}` };
  } }), (error) => {
    assert.deepEqual(error.diagnostic, { operation: "view", exit_code: 1, npm_code: "E404" });
    assertPrivate(error);
    return true;
  });
  const legacy = new NpmReleaseError("registry_read_unavailable", "legacy message");
  assert.equal(legacy.message, "legacy message");
  assert.equal(Object.hasOwn(legacy, "diagnostic"), false);
  for (const diagnostic of [privateText, [], { operation: privateText, exit_code: -1, system_code: privateText,
    npm_code: privateText, signal: privateText, killed: 1, stderr: privateText }]) {
    const error = new NpmReleaseError("registry_read_unavailable", "registry_read_unavailable", diagnostic);
    assert.deepEqual(error.diagnostic, typeof diagnostic === "object" && !Array.isArray(diagnostic) ? { operation: "unknown" } : undefined);
    assertPrivate(error);
  }
});

const stagedPair = async (callback) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "npm-diagnostic-pair-"));
  const values = { RELEASE_TAG: "v0.2.0", RELEASE_SHA: sourceSha, VERSION: "0.2.0",
    TARBALL: "./package/local.tgz", INITIALIZER_TARBALL: "./package/initializer.tgz" };
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    await mkdir(path.join(directory, "package"));
    await mkdir(path.join(directory, "identity"));
    for (const [name, folder, packageName] of [["local", "local-package", "@eff3ct/agent-foundry"], ["initializer", "local-initializer", INITIALIZER_NAME]]) {
      const packageRoot = path.join(directory, folder);
      await mkdir(packageRoot);
      await cp(path.join(root, name === "local" ? "package.json" : "initializer/package.json"), path.join(packageRoot, "package.json"));
      await cp(path.join(root, name === "local" ? "dist" : "initializer/bin"), path.join(packageRoot, name === "local" ? "dist" : "bin"), { recursive: true });
      const tarballPath = path.join(directory, `package/${name}.tgz`);
      await writeFile(tarballPath, `${name} immutable bytes`);
      const identity = await readPackageIdentity({ packageRoot, tarballPath, tag: values.RELEASE_TAG, sourceSha, packageName });
      await writeFile(path.join(directory, "identity", `${name}.json`), JSON.stringify(identity));
    }
    Object.assign(process.env, values);
    return await callback(directory);
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
};

test("terminal view and pack diagnostics survive five reads, outer rethrow and pair-state persistence", async () => {
  for (const failedOperation of ["view", "pack"]) {
    await stagedPair(async (directory) => {
      let reads = 0;
      const waits = [];
      const calls = [];
      let terminal;
      const npm = async (args, cwd) => {
        if (args[0] !== failedOperation) return "{}";
        reads += 1;
        try {
          return await npmCommand(args, cwd, false, { execute: () => execFile(process.execPath,
            ["-e", `process.stdout.write(${JSON.stringify(privateText)}); process.stderr.write("npm error code ${reads === 5 ? "E404" : "E401"}\\n"); process.exit(1)`], { env: {} }) });
        } catch (error) { terminal = error; throw error; }
      };
      await assert.rejects(publishPair(directory, {
        probe: async () => ({ status: "absent" }),
        claim: async () => { calls.push("claim"); return { status: "claimed" }; },
        publish: async (identity) => { calls.push(identity.package.name); },
        readback: (identity) => registryReadback(identity, directory, path.join(directory, "identity"), {
          npm, wait: async (ms) => { waits.push(ms); },
        }),
      }), (error) => {
        assert.notEqual(error, terminal);
        assert.equal(error.code, "registry_read_unavailable");
        assert.deepEqual(error.diagnostic, { operation: failedOperation, exit_code: 1, npm_code: "E404", killed: false });
        assertPrivate(error);
        return true;
      });
      assert.equal(reads, 5);
      assert.deepEqual(waits, [5000, 10000, 15000, 20000]);
      assert.deepEqual(calls, ["claim", packageName]);
      const serialized = await readFile(path.join(directory, "identity", "pair-state.json"), "utf8");
      const evidence = JSON.parse(serialized);
      assert.equal(evidence.phase, "stopped_after_publish_0_returned");
      assert.deepEqual(evidence.diagnostic, { code: "registry_read_unavailable", ...terminal.diagnostic });
      assert.equal(evidence.sha, sourceSha);
      assert.equal(evidence.packages.length, 2);
      assert.ok(Buffer.byteLength(JSON.stringify(evidence.diagnostic)) < 256);
      for (const sentinel of privateText.split(" ")) assert.equal(serialized.includes(sentinel), false);
    });
  }
});

test("pair evidence revalidates mutated diagnostics and classifies unknown errors without leaking messages", async () => {
  const classified = new NpmReleaseError("registry_read_unavailable", privateText);
  classified.diagnostic = { operation: "view", exit_code: "1", npm_code: "E_PRIVATE_SENTINEL",
    signal: privateText, killed: "true", stdout: privateText, cause: privateText };
  for (const failure of [classified, new Error(privateText), new NpmReleaseError(privateText, privateText), null]) {
    await stagedPair(async (directory) => {
      await assert.rejects(publishPair(directory, {
        probe: async () => ({ status: "present" }),
        claim: async () => assert.fail("present pair must not claim"),
        publish: async () => assert.fail("present pair must not publish"),
        readback: async () => { throw failure; },
      }), (error) => {
        assert.equal(error.code, failure === classified ? "registry_read_unavailable" : "release_outcome_uncertain");
        assertPrivate(error);
        return true;
      });
      const serialized = await readFile(path.join(directory, "identity", "pair-state.json"), "utf8");
      assert.deepEqual(JSON.parse(serialized).diagnostic, failure === classified
        ? { code: "registry_read_unavailable", operation: "view" } : { code: "release_outcome_uncertain" });
      for (const sentinel of privateText.split(" ")) assert.equal(serialized.includes(sentinel), false);
    });
  }
});

test("npm release CLI reports only a trusted classification for raw filesystem failures", async () => {
  await assert.rejects(execFile(process.execPath, [path.join(root, "scripts/npm-release.mjs"),
    "--command", "verify-local", "--package-root", path.join(root, "npm_PRIVATE_SENTINEL-missing"),
    "--tarball", privateText, "--tag", "v0.2.0", "--source-sha", sourceSha, "--output", privateText], { env: {} }), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "");
    assert.equal(error.stderr, "release_outcome_uncertain\n");
    return true;
  });
});
