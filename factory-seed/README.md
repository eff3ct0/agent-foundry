# Local Rust factory seed

Only `factory.defaults.json` and `.github/workflows/rust.yml` at the source
root are candidates for a later, separately authorized factory v1 publication.
This directory is a source-only sample; the creator copies neither it nor the
root seed files to generated projects. The ownership inventory removes all
three paths. The sample has no external Rust dependencies.

For an offline proof, copy the two root files into a clean local Git factory
checkout, commit them, tag that commit `v1`, and supply its full SHA from an
independent trusted record. Keep project answers outside that checkout:
`FACTORY_SPEC=eff3ct0/factory@v1`, `CI_STACKS=rust`, and a project name.
Factory defaults intentionally do not select a project stack. After creator
apply/verify, copy this sample's `Cargo.toml` and `src/lib.rs` into the generated
project and run the four Rust workflow commands with `CARGO_NET_OFFLINE=true`.
A local tag does not prove that the hosted factory tag exists or that GitHub
Actions can resolve and execute the reusable workflow.
