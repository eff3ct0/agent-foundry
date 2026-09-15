## Proveedor de tareas personalizado

> **Instancia del contrato:** [`_contract.md`](../providers/task/_contract.md)
> **Capacidad:** `task`
> **Proveedor:** `custom`

Proveedor de tareas personalizado: definí aquí las reglas — nombre, dónde viven las tareas, ciclo de estados y prohibiciones.

<TASK_TRACKER_CUSTOM_RULES>

**Vinculación:** Las tareas viven exclusivamente en el sistema declarado por el proyecto.

**Cómo interactúa el agente:** el harness aporta MCP, CLI o API; estas reglas deben indicar cómo leer, crear, actualizar y comentar tareas.

**Reglas y ciclo:** definí el ciclo de estados y cómo referenciar las tareas en commits/PRs y checkpoints.

**Prohibiciones:** no uses trackers alternativos ni cierres una tarea sin verificación.
