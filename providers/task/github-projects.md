## GitHub Projects

**Vinculación:** Las tareas de este proyecto viven EXCLUSIVAMENTE en GitHub Projects v2 (tablero `<TRACKER_KEY>`). El agente DEBE crear/actualizar los ítems y mover su estado ahí, y NO puede usar otro tracker.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Operaciones semánticas: crear ítem (o vincular una issue existente), fijar campos, cambiar el campo de estado.

**Reglas y ciclo:**
- Estado por el campo del tablero: *To Do* → *In Progress* → *Done*.
- Cada ítem se respalda en una issue vinculada del repo cuando aplique, para referenciarla desde commits/PR.
- Al empezar, mové el ítem a *In Progress* y comentá el plan en la issue vinculada; al cerrar, a *Done*.
- Una tarjeta = una unidad de trabajo.

**Prohibiciones:**
- NO abrir tareas en Jira, Linear ni un tablero distinto.
- NO cerrar con verificación pendiente o fallida.
- NO dejar el estado solo en la sesión.
