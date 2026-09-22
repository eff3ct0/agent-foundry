import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateTag } from "./release-ref.mjs";
import { ReleaseReadbackError, resolvePublishedRelease } from "./release-readback.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const SHA = /^[0-9a-f]{40}$/u;

export class ReleasePrepareError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const fail = (code) => { throw new ReleasePrepareError(code); };

const recipeMatrix = (value) => {
  if (!object(value)) fail("invalid_recipe_matrix");
  const recipes = Object.keys(value).sort();
  if (recipes.length === 0 || recipes.some((recipe) => !/^[a-z][a-z0-9-]{0,63}$/u.test(recipe) || typeof value[recipe] !== "string" || !value[recipe])) {
    fail("invalid_recipe_matrix");
  }
  return recipes;
};

const fixtureResult = (value) => {
  if (!object(value) || !["ok", "indeterminate", "rejected", "missing"].includes(value.status)) fail("invalid_fixture");
  if (value.status === "ok" && !object(value.payload)) fail("invalid_fixture");
  if (["indeterminate", "rejected"].includes(value.status) && (typeof value.code !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(value.code))) {
    fail("invalid_fixture");
  }
  if (Object.keys(value).some((key) => !["status", "payload", "code"].includes(key))) fail("invalid_fixture");
  return value;
};

export const createFixtureReadClient = (fixture) => {
  if (!object(fixture) || !object(fixture.responses) || Object.keys(fixture).some((key) => key !== "responses")) fail("invalid_fixture");
  const responses = new Map();
  for (const [endpoint, result] of Object.entries(fixture.responses)) {
    if (!endpoint.startsWith("/repos/") || endpoint.includes("//") || endpoint.includes("?") || endpoint.includes("#")) fail("invalid_fixture");
    responses.set(endpoint, fixtureResult(result));
  }
  return {
    async get(endpoint) {
      return responses.get(endpoint) ?? { status: "rejected", code: "fixture_response_missing" };
    },
  };
};

export const prepareRelease = async ({ client, repository, tag, expectedSha, recipes }) => {
  const matrix = recipeMatrix(recipes);
  const release = await resolvePublishedRelease({ client, repository, tag, expectedSha });
  if (release.status !== "ok") return { schema_version: 1, status: release.status, code: release.code };
  return {
    schema_version: 1,
    status: "ok",
    release: { tag: release.tag, sha: release.sha },
    matrix: { recipe_count: matrix.length, recipes: matrix },
  };
};

const parseArgs = (values) => {
  const options = {};
  if (values.length !== 8) fail("invalid_arguments");
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!["--repository", "--tag", "--expected-sha", "--fixture"].includes(name) || typeof value !== "string" || !value || options[name]) fail("invalid_arguments");
    options[name] = value;
  }
  if (Object.keys(options).length !== 4 || !REPOSITORY.test(options["--repository"]) || !SHA.test(options["--expected-sha"].toLowerCase())) fail("invalid_arguments");
  let tag;
  try {
    tag = validateTag(options["--tag"]);
  } catch {
    fail("invalid_arguments");
  }
  return {
    repository: options["--repository"],
    tag,
    expectedSha: options["--expected-sha"].toLowerCase(),
    fixturePath: path.resolve(options["--fixture"]),
  };
};

const failure = (error) => ({
  schema_version: 1,
  status: "rejected",
  code: error instanceof ReleasePrepareError || error instanceof ReleaseReadbackError ? error.code : "unexpected_failure",
});

export const main = async (values = process.argv.slice(2), read = readFile) => {
  try {
    const options = parseArgs(values);
    const [fixture, recipes] = await Promise.all([
      read(options.fixturePath, "utf8").then((content) => JSON.parse(content)).catch(() => fail("invalid_fixture")),
      read(path.join(root, "ci", "recipes.json"), "utf8").then((content) => JSON.parse(content)).catch(() => fail("invalid_recipe_matrix")),
    ]);
    return prepareRelease({ client: createFixtureReadClient(fixture), recipes, ...options });
  } catch (error) {
    return failure(error);
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "ok") process.exitCode = 1;
  });
}
