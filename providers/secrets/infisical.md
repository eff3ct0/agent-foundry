## Infisical

**Vinculación:** Los secretos se obtienen EXCLUSIVAMENTE de Infisical (path `<SECRETS_PATH>`). El agente DEBE leerlos desde ahí en tiempo de comando y NO puede tomarlos de otra fuente ni inventarlos.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Operación semántica: inyectar los secretos del path `<SECRETS_PATH>` como entorno del comando que los necesita, con lectura efímera.

**Reglas y ciclo:**
- Inyección en tiempo de comando: los valores se resuelven al ejecutar y viven solo mientras dura el proceso.
- Lectura efímera: usar y descartar; nunca materializar el valor a disco.
- Referí los secretos por su nombre/clave, nunca por su valor.

**Prohibiciones:**
- NUNCA persistir, loguear ni commitear el valor de un secreto.
- NO copiar secretos a `.env`, archivos de config ni al historial de la sesión.
- NO usar otra fuente de secretos que no sea Infisical.
> **Instancia del contrato:** [`_contract.md`](../providers/secrets/_contract.md)
> **Capacidad:** `secrets`
> **Proveedor:** `infisical`
