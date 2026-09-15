## GitHub Issues

> **Instancia del contrato:** [`_contract.md`](../providers/task/_contract.md)
> **Capacidad:** `task`
> **Proveedor:** `github-issues`

**Vinculación:** Las tareas de este proyecto viven EXCLUSIVAMENTE en GitHub Issues del repo (`<TRACKER_KEY>`). El agente DEBE crear, actualizar y cerrar issues ahí y NO puede usar otro tracker.

**Cómo interactúa el agente:** vía el mecanismo que provea su harness (MCP / CLI / API). Operaciones semánticas: abrir issue, comentar, aplicar/quitar labels, cerrar.

**Plantilla obligatoria:** toda issue nueva DEBE seguir la plantilla correspondiente de
`.github/ISSUE_TEMPLATE/` (`task.yml` para trabajo del producto o `bug.yml` para defectos). En la web,
usá el formulario correspondiente. El cuerpo debe incluir contexto/problema, criterios de aceptación,
alcance y verificación. Con `gh`, rellená primero esa estructura equivalente y creá la issue
con `gh issue create --repo <OWNER>/<REPO> --title "<título>" --label "type:product" --body-file <plantilla-rellena>`
o `--label "type:bug"`, según corresponda.
No uses `gh issue create` con `--body` libre ni sin cuerpo.

**Pull requests:** todo PR DEBE usar la plantilla `.github/pull_request_template.md`. Con `gh`, rellená
esa estructura en un archivo y abrilo con `gh pr create --body-file <plantilla-rellena>`; no abras PRs sin
la plantilla ni con un cuerpo libre.

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
