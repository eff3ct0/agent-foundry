# Flujo de trabajo end-to-end

Cómo se ejecuta el trabajo de desarrollo en `<PROJECT_NAME>`, del objetivo a la entrega.
Agnóstico de lenguaje/stack. Placeholders `<UPPER_SNAKE>` se rellenan en el bootstrap.

## 1. Intake y especificación
- Capturar el **objetivo** (qué problema y para quién).
- Definir **criterios de aceptación** verificables.
- Fijar el **alcance**: qué entra (in) y qué queda fuera (out).
- Registrar supuestos y dependencias.

## 2. Descomposición en tickets
- Descomponer en tickets dentro de `<TRACKER>`.
- **Un ticket = una unidad de trabajo** (una sesión de agente).
- Enlazar cada ticket a su epic `<EPIC_ID>`.
- Usar la plantilla [`templates/ticket.md`](../templates/ticket.md).

## 3. Ramas
- Modelo: `<BRANCHING_MODEL>`.
- **Una rama por ticket** desde `<INTEGRATION_BRANCH>`.
- Naming: `<BRANCH_NAMING>` (p. ej. `<TICKET_ID>-descripcion-corta`).

## 4. Ejecución por sesiones (loop)
- Ver el ciclo completo en [`templates/agent-runbook.md`](../templates/agent-runbook.md).
- **Una tarea por sesión**; nada de dispersión.
- Anunciar al empezar: `Trabajando <TICKET_ID>`.
- Mover el ticket a *In Progress* y comentar el plan.

## 5. Verificación
- `<TEST_CMD>`, `<BUILD_CMD>` y `<TYPECHECK_CMD>` en verde.
- Comprobación **e2e real** contra `<ENV>` cuando el cambio lo amerite.
- **Implementado ≠ verificado**: sin señal real, no está hecho.

## 6. Review
- **Self-review** del diff (leerlo entero antes de pedir review).
- Segundo par / **review adversarial**.
- Checklist: alcance respetado, tests significativos, sin secretos, sin placeholders, contrato retrocompatible.

## 7. Definition of Done
- Contrato de cierre en [`templates/definition-of-done.md`](../templates/definition-of-done.md).
- No se marca "hecho" con verificación pendiente o fallida.

## 8. Handoff / checkpoint
- Antes de terminar o de una compactación, dejar **estado durable** en tracker + VCS.
- Commit (WIP si hace falta) + comentario en el ticket: qué falta, rama, último commit, siguiente paso.
- Anunciar `CHECKPOINT <TICKET_ID>`.

## 9. Integración y despliegue
- `<INTEGRATION_BRANCH>` → `<ENVIRONMENTS>` (dev → staging → prod).
- Puertas de aprobación: `<APPROVAL_GATED_ACTIONS>` no se auto-ejecutan sin OK explícito.
