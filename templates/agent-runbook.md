# Runbook de agente — ejecución por sesiones (loop)

Cómo ejecuta un agente el trabajo en `<PROJECT_NAME>`. Neutro y agnóstico.

## Por qué esto es un contrato (no un runner)
El bucle lo ejecuta el harness del agente (agnóstico: /loop, un `while`, cron, un orquestador). Aquí
viven las REGLAS que hacen converger a un agente no determinista, no el mecanismo. La reproducibilidad
vive en el spec y en la verificación, no en el agente.

### Reglas de convergencia
1. **Una tarea por iteración.** Monolítico y secuencial; nunca dos escritores en paralelo sobre el mismo
   trabajo. Una tarea = una sesión.
2. **Estado externalizado.** El estado durable vive en el tracker vinculado (ver `docs/bindings.md` /
   `<TRACKER>`) + el control de versiones. La iteración LEE el estado al arrancar y lo ACTUALIZA al
   cerrar o al hacer checkpoint. Nunca en la memoria de la sesión.
3. **Verificación como trinquete.** Una tarea está "hecha" solo cuando su check / Definition of Done
   pasa. Ante un fallo, resolvé la causa raíz para que no reaparezca (no parchear el síntoma); si aporta,
   dejá una regresión que lo fije.
4. **Paradas explícitas.** El loop se detiene cuando no queda tarea accionable, o cuando un paso exige
   una decisión humana o una acción con aprobación (`<APPROVAL_GATED_ACTIONS>`): marcá `BLOQUEADA` y
   cedé el control. No inventes consentimiento.

## Principio: la sesión es desechable
El **estado durable** vive en `<TRACKER>` + VCS, nunca solo en la memoria de la sesión.
Cada sesión toma una tarea, la lleva a un punto durable, deja estado y termina.

## Ciclo de sesión
Cada paso operacionaliza las [Reglas de convergencia](#reglas-de-convergencia) de arriba (una tarea,
estado externalizado, verificación-trinquete, paradas explícitas): no las repite, las aplica.

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

> Doctrina inspirada en la técnica del *Ralph loop* (agentes no deterministas → convergencia por
> disciplina y verificación, no por el runner).

## Guardarraíles
- **Aprobación humana:** las acciones de `<APPROVAL_GATED_ACTIONS>` no se auto-ejecutan;
  marcar `BLOQUEADA: requiere aprobación` y seguir.
- **Anti-bucle infinito:** 2 fallos por el mismo motivo → marcar `BLOQUEADA` y pasar a la siguiente.
- **Sin dispersión:** una sola tarea por sesión.

## Cómo lanzarlo
- **Loop por CLI:** un comando por iteración, cada iteración = sesión nueva.
- **Manual:** ejecutar el ciclo a mano, una tarea por vez.
