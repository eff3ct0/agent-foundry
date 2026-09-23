#!/usr/bin/env node
import { validateTag } from "./release-ref.mjs";

const repository = process.argv[process.argv.indexOf("--repository") + 1];
const tag = validateTag(process.argv[process.argv.indexOf("--tag") + 1]);
const token = process.env.GITHUB_TOKEN;
if (!repository || !token) throw new Error("repository and GITHUB_TOKEN are required");
const response = await fetch(`https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" }, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error("release ref readback failed");
const ref = await response.json();
const object = ref.object;
const sha = object?.type === "commit" ? object.sha : (await (await fetch(`https://api.github.com/repos/${repository}/git/commits/${object?.sha}`, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })).json()).sha;
if (!/^[0-9a-f]{40}$/u.test(sha ?? "")) throw new Error("release ref did not resolve to a full commit SHA");
process.stdout.write(`sha=${sha}\n`);
