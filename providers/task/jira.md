## Jira

**Vinculación:** Las tareas de este proyecto viven EXCLUSIVAMENTE en Jira (proyecto/tablero `<TRACKER_KEY>`). El agente DEBE crear, actualizar y transicionar sus tareas ahí y NO puede usar otro tracker.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API); da igual cuál. Opera sobre las operaciones semánticas de Jira: crear issue, comentar, transicionar de estado, enlazar al epic `<EPIC_ID>`.

**Plantilla obligatoria:** al crear una issue es OBLIGATORIO usar la plantilla de issue correspondiente
definida por el proyecto/proveedor y su tipo (`task` o `bug`); están prohibidas las issues en blanco o
en formato libre.

**Reglas y ciclo:**
- Estados: *To Do* → *In Progress* → *Done* (mapeá el equivalente real del tablero si difiere).
- Al empezar, mové la issue a *In Progress* y comentá el plan; al cerrar, a *Done*.
- Dejá comentarios de progreso/checkpoint en la propia issue: el estado durable vive ahí, no en la sesión.
- Una issue = una unidad de trabajo (una sesión).
- Cada commit/PR referencia la clave de la issue (`<TRACKER_KEY>-NNN`).

**Prohibiciones:**
- NO abrir tareas en GitHub Issues, Linear ni ningún otro sistema.
- NO marcar *Done* con verificación pendiente o fallida.
- NO dejar el estado solo en la sesión: si no está en Jira, no existe.
