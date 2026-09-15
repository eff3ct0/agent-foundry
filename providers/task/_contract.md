# Contrato abstracto: proveedor de tareas

Este archivo define la forma obligatoria de una instancia de `task`. No es un
proveedor seleccionable y nunca se compone en `docs/bindings.md`.

Todo fragmento `providers/task/<proveedor>.md` debe incluir estos campos:

## Identidad

- `Instancia del contrato`: referencia a este archivo.
- `Capacidad`: `task`.
- `Proveedor`: nombre del sistema vinculado.

## Vinculación

Debe indicar dónde viven las tareas y dejar claro que el uso del proveedor es
obligatorio y exclusivo.

## Cómo interactúa el agente

Debe distinguir el mecanismo que aporta el harness (MCP, CLI o API) de las
reglas semánticas que define el binding. Debe cubrir como mínimo cómo leer una
tarea, crearla si aplica, actualizar sus campos o estado y añadir comentarios.

## Reglas y ciclo

Debe definir el ciclo de estados, cómo se referencia la tarea en commits/PRs,
y dónde se deja el estado durable durante checkpoints y cierre.

## Prohibiciones

Debe enumerar el uso de trackers alternativos y cualquier cierre o transición
sin verificación.
