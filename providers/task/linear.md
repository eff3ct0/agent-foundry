## Linear

**Vinculación:** Las tareas de este proyecto viven EXCLUSIVAMENTE en Linear (equipo/proyecto `<TRACKER_KEY>`). El agente DEBE crear, actualizar y transicionar issues ahí y NO puede usar otro tracker.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Operaciones semánticas: crear issue, comentar, cambiar estado, asociar al proyecto/ciclo.

**Plantilla obligatoria:** al crear una issue es OBLIGATORIO usar la plantilla de issue correspondiente
definida por el proyecto/proveedor y su tipo (`task` o `bug`); están prohibidas las issues en blanco o
en formato libre.

**Reglas y ciclo:**
- Ciclo de estados de Linear: *Backlog/Todo* → *In Progress* → *Done* (usá los estados reales del equipo).
- Al empezar, mové la issue a *In Progress* y comentá el plan; al cerrar, a *Done*.
- Comentarios de progreso/checkpoint en la propia issue.
- Una issue = una unidad de trabajo. Cada commit/PR referencia el identificador (`<TRACKER_KEY>-NNN`).

**Prohibiciones:**
- NO abrir tareas en Jira, GitHub ni otro sistema.
- NO cerrar con verificación pendiente o fallida.
- NO dejar el estado solo en la sesión.
