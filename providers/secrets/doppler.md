## Doppler

**Vinculación:** Los secretos se obtienen EXCLUSIVAMENTE de Doppler (proyecto-config `<SECRETS_PATH>`). El agente DEBE inyectarlos desde ahí en tiempo de comando y NO puede tomarlos de otra fuente.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Operación semántica: inyectar el entorno del proyecto-config `<SECRETS_PATH>` (p. ej. `doppler run`) al comando que lo necesita, con lectura efímera.

**Reglas y ciclo:**
- Inyección de entorno por proyecto-config: los valores se resuelven al ejecutar y viven solo durante el proceso.
- Lectura efímera: usar y descartar; nunca materializar el valor a disco.
- Referí los secretos por su nombre, nunca por su valor.

**Prohibiciones:**
- NUNCA persistir, loguear ni commitear el valor de un secreto.
- NO exportar el entorno de Doppler a un `.env` versionado.
- NO usar otra fuente de secretos que no sea Doppler.
> **Instancia del contrato:** [`_contract.md`](../providers/secrets/_contract.md)
> **Capacidad:** `secrets`
> **Proveedor:** `doppler`
