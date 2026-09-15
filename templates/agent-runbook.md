# Runbook de agente — ejecución por sesiones (loop)

Cómo ejecuta un agente el trabajo en `<PROJECT_NAME>`. Neutro y agnóstico.

## Principio: la sesión es desechable
El **estado durable** vive en `<TRACKER>` + VCS, nunca solo en la memoria de la sesión.
Cada sesión toma una tarea, la lleva a un punto durable, deja estado y termina.

## Ciclo de sesión
1. **Elegir** la siguiente tarea accionable: primero *In Progress*, luego *To Do* en orden.
   Anunciar `Trabajando <TICKET_ID>`.
2. **Mover** la tarea a *In Progress* y comentar el plan.
3. **Ejecutar SOLO esa** tarea (nada de dispersión).
4. **Verificar** con señales reales (`<TEST_CMD>`, `<BUILD_CMD>`, `<TYPECHECK_CMD>` + e2e si aplica).
5. **Cumplir** la [Definition of Done](definition-of-done.md) y mover a *Done* con evidencia.
6. **Terminar** la sesión (una tarea = una sesión).

## Checkpoint antes de compactación (tarea a medias)
- Commit WIP.
- Comentar en el ticket: estado, qué falta, rama, último commit, siguiente paso.
- Anunciar `CHECKPOINT <TICKET_ID>`.
- Terminar.

## Guardarraíles
- **Aprobación humana:** las acciones de `<APPROVAL_GATED_ACTIONS>` no se auto-ejecutan;
  marcar `BLOQUEADA: requiere aprobación` y seguir.
- **Anti-bucle infinito:** 2 fallos por el mismo motivo → marcar `BLOQUEADA` y pasar a la siguiente.
- **Sin dispersión:** una sola tarea por sesión.

## Cómo lanzarlo
- **Loop por CLI:** un comando por iteración, cada iteración = sesión nueva.
- **Manual:** ejecutar el ciclo a mano, una tarea por vez.
