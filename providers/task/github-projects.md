## GitHub Projects

**Vinculación:** Las tareas de este proyecto viven EXCLUSIVAMENTE en GitHub Projects v2 (tablero `<TRACKER_KEY>`). El agente DEBE crear/actualizar los ítems y mover su estado ahí, y NO puede usar otro tracker.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Operaciones semánticas: crear ítem (o vincular una issue existente), fijar campos, cambiar el campo de estado.

**Plantilla obligatoria:** una issue nueva vinculada al tablero DEBE crearse usando la plantilla
correspondiente de `.github/ISSUE_TEMPLATE/` (`task` o `bug`). Con `gh`, usá un cuerpo previamente
rellenado con esa estructura mediante `gh issue create --body-file <plantilla-rellena>` y después
vinculá la issue al proyecto; no crees issues en blanco o en formato libre.

**Pull requests:** todo PR DEBE usar `.github/pull_request_template.md`. Con `gh`, rellená esa estructura
en un archivo y abrilo con `gh pr create --body-file <plantilla-rellena>`; no abras PRs sin la plantilla ni
con un cuerpo libre.

**Reglas y ciclo:**
- Estado por el campo del tablero: *To Do* → *In Progress* → *Done*.
- Cada ítem se respalda en una issue vinculada del repo cuando aplique, para referenciarla desde commits/PR.
- Al empezar, mové el ítem a *In Progress* y comentá el plan en la issue vinculada; al cerrar, a *Done*.
- Una tarjeta = una unidad de trabajo.

**Prohibiciones:**
- NO abrir tareas en Jira, Linear ni un tablero distinto.
- NO cerrar con verificación pendiente o fallida.
- NO dejar el estado solo en la sesión.
