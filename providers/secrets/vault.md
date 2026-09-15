## HashiCorp Vault

**Vinculación:** Los secretos se obtienen EXCLUSIVAMENTE de Vault (mount/path `<SECRETS_PATH>`). El agente DEBE leerlos desde ahí en tiempo de comando y NO puede tomarlos de otra fuente.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Auth por rol (la identidad la aporta el entorno). Operación semántica: leer el secreto de `<SECRETS_PATH>` de forma efímera e inyectarlo en el comando.

**Reglas y ciclo:**
- Auth por rol: la credencial de acceso a Vault la provee el entorno, no se hardcodea.
- Lectura efímera: resolver al ejecutar, mantener en memoria, descartar al terminar.
- Respetar el TTL/lease del secreto; no cachear más allá de su vida útil.

**Prohibiciones:**
- NUNCA persistir, loguear ni commitear el valor de un secreto.
- NO copiar secretos a `.env` ni a archivos de config.
- NO usar otra fuente de secretos que no sea Vault.
> **Instancia del contrato:** [`_contract.md`](../providers/secrets/_contract.md)
> **Capacidad:** `secrets`
> **Proveedor:** `vault`
