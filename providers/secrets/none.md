## No secrets manager

> **Contract instance:** [`_contract.md`](./_contract.md)
> **Capability:** `secrets`
> **Provider:** `none`

**Binding:** This project does NOT manage real secrets. Use only `.env.example`
with fictional values. Introducing real secrets into the repository or agent
environment is PROHIBITED.

**Agent resolution:** no secret lookup or injection is available.

**Usage rules:** if real secrets become necessary, first choose a secrets manager
(Infisical / Vault / Doppler) and update this binding.

**Prohibitions:**
- Do not paste real credentials into code, configuration, or the agent session.
- Do not use an alternate secrets provider.
