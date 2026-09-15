## Gestor de secretos personalizado

Gestor de secretos personalizado: definí aquí las reglas — nombre, dónde viven los secretos, cómo se inyectan (lectura efímera en tiempo de comando) y prohibiciones.

<SECRETS_PROVIDER_CUSTOM_RULES>
> **Instancia del contrato:** [`_contract.md`](../providers/secrets/_contract.md)
> **Capacidad:** `secrets`
> **Proveedor:** `custom`

**Vinculación:** Definí dónde viven los secretos y la ruta o mount del proyecto.

**Cómo resuelve el agente:** el harness aporta MCP, CLI o API; definí cómo localizar, leer y montar o inyectar secretos sin exponer sus valores.

**Reglas de uso:** Definí cómo se usan los secretos en los comandos y qué referencia durable queda en el proyecto.

**Prohibiciones:** no guardes secretos en código, logs, commits ni memoria persistente; no uses proveedores alternativos.
