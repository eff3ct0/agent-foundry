{ pkgs, ... }:

{
  # package.json `engines` asks for node >=20.19; nixpkgs no longer ships 20
  # (EOL), so use the oldest maintained LTS. CI still checks node 20.
  # corepack provides a `pnpm` shim that runs the exact `packageManager`
  # version (pnpm@12.4.2), including in the subprocesses the tests spawn.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    corepack.enable = true;
  };

  # Tools the test suite shells out to and the CI runner already has:
  # `openssl` (package provenance) and `go` (generated Go gates). The PTY
  # installer tests look for /usr/bin/script and skip on NixOS.
  packages = [
    pkgs.openssl
    pkgs.go
  ];

  # Fetch the pinned pnpm without an interactive confirmation.
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";

  # Same gate as .github/workflows/archetype-node20.yml: `devenv shell -- ci`.
  scripts.ci.exec = ''
    pnpm install --frozen-lockfile
    node scripts/prepare-offline-npm-cache.mjs
    pnpm typecheck
    pnpm test
  '';
}
