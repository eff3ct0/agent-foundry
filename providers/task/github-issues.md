## GitHub Issues

**Vinculación:** Las tareas de este proyecto viven EXCLUSIVAMENTE en GitHub Issues del repo (`<TRACKER_KEY>`). El agente DEBE crear, actualizar y cerrar issues ahí y NO puede usar otro tracker.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Operaciones semánticas: abrir issue, comentar, aplicar/quitar labels, cerrar.

**Reglas y ciclo:**
- Tipo por label: `task` para trabajo, `bug` para defectos.
- Estado por labels (p. ej. `status:in-progress`) o por el estado nativo abierto/cerrado; usá el que el repo ya tenga.
- Al empezar, marcá la issue en progreso y comentá el plan; al cerrar, cerrala referenciando el commit/PR.
- Comentarios de progreso/checkpoint en la propia issue.
- Una issue = una unidad de trabajo. Cada commit/PR referencia `#<número>`.

**Prohibiciones:**
- NO abrir tareas en Jira, Linear ni otro sistema.
- NO cerrar con verificación pendiente o fallida.
- NO usar solo la memoria de la sesión como estado.
