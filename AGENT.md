# AGENT.md — Archetype de trabajo de desarrollo (agente-first, agnóstico)

Documento **principal** para agentes (y humanos) que trabajan en `<PROJECT_NAME>`. Es una plantilla:
los `<PLACEHOLDER>` se rellenan al inicializar el proyecto (ver [`docs/bootstrap.md`](docs/bootstrap.md)).
No es específico de ningún lenguaje ni stack.

> **Lo PRIMERO al abrir este repo:** corré `python3 start.py` y seguí lo que indique. Detecta el modo
> (inicializar vs. trabajar) e imprime el próximo paso; no ejecuta acciones por sí mismo.

> Convención de placeholders: `<UPPER_SNAKE>` = valor a rellenar; `<!-- guía: … -->` = instrucción para
> quien rellena; una sección marcada `OPCIONAL` se borra si no aplica.

## Coordenadas del proyecto (rellenar)
- Nombre: `<PROJECT_NAME>` — Repos: `<REPO_URLS>`
- Stack: `<LANGUAGES_AND_FRAMEWORKS>` — Gestor de paquetes: `<PACKAGE_MANAGER>`
- Tracker de tareas: `<TRACKER>` (proyecto/tablero `<TRACKER_KEY>`)
- Estrategia de ramas: `<BRANCHING_MODEL>` (p. ej. trunk-based / GitHub flow) — rama de integración `<INTEGRATION_BRANCH>`
- Comandos base: build `<BUILD_CMD>` · test `<TEST_CMD>` · lint `<LINT_CMD>` · typecheck `<TYPECHECK_CMD>` · run `<RUN_CMD>`
- Entornos: `<ENVIRONMENTS>` (dev / staging / prod y cómo se despliega cada uno)
- Baseline de organización (Factory OS): `<FACTORY_SPEC>` — spec de organización que rige este repo; el contenido local lo sobreescribe. Ver [`docs/org-factory.md`](docs/org-factory.md).

## Documentos de este archetype
- [`docs/workflow.md`](docs/workflow.md) — **flujo de trabajo end-to-end**: intake → spec → tickets →
  ramas → ejecución por sesiones/loop → verificación → review → Definition of Done → handoff.
- [`docs/engineering-handbook.md`](docs/engineering-handbook.md) — **estándares de ingeniería**: código,
  testing, seguridad, CI/CD, arquitectura, documentación, observabilidad.
- [`docs/bootstrap.md`](docs/bootstrap.md) — **cómo inicializar** un proyecto nuevo a partir de esta
  plantilla (rellenar placeholders, tooling, primer commit, checklist).
- [`docs/bindings.md`](docs/bindings.md) — **contrato de proveedores**: a qué tracker de tareas y gestor de
  secretos está atado el proyecto (se compone al inicializar desde `providers/`). Uso obligatorio y exclusivo.
- [`docs/org-factory.md`](docs/org-factory.md) — **capa de organización**: cómo referenciar el spec desde los repos de la org (repo `.github` + pin `FACTORY_SPEC`).
- [`docs/agent-init.md`](docs/agent-init.md) — **modo agente**: procedimiento para inicializar el proyecto desde la plantilla (detección de stack, bindings, verificación).
- [`templates/`](templates/) — plantillas reutilizables: ticket, pull request, Definition of Done, ADR,
  y el runbook de agente, que es el **contrato de ejecución en loop** del proyecto (reglas de convergencia).

## Reglas operativas (núcleo, agnóstico)
1. **El estado durable vive fuera de la sesión:** en el tracker (`<TRACKER>`) y en el control de versiones.
   Nunca solo en la memoria de la sesión. Una sesión es desechable.
2. **Una unidad de trabajo por sesión.** Tomás un ticket, lo llevás a un punto durable, dejás estado y
   terminás. El **contrato de ejecución en loop** del proyecto (reglas de convergencia y detalle del ciclo)
   es [`templates/agent-runbook.md`](templates/agent-runbook.md).
3. **Anunciá siempre** en qué trabajás al empezar y al cerrar/checkpoint (`Trabajando/CHECKPOINT/Hecho <TICKET_ID>`).
4. **Una sola ruta de implementación por cambio.** Nada de abstracciones especulativas (YAGNI). El diff
   más corto que resuelve el problema entendido, no el más corto sin entenderlo.
5. **Verificá con señales reales** antes de declarar algo hecho: tests, build/typecheck en verde, y una
   comprobación end-to-end contra un entorno real cuando el cambio lo amerite. Implementado ≠ verificado.
6. **Definition of Done** ([`templates/definition-of-done.md`](templates/definition-of-done.md)) es el
   contrato de cierre de cada ticket. No se marca "hecho" con verificación pendiente o fallida.
7. **Cambios aditivos y retrocompatibles** en contratos (API, esquemas, payloads persistidos): lo viejo
   debe seguir siendo válido salvo migración explícita.
8. **Puertas de aprobación humana:** las acciones difíciles de revertir o hacia afuera
   (`<APPROVAL_GATED_ACTIONS>`, p. ej. migraciones de datos, despliegue a prod, borrados, publicación)
   NO se auto-ejecutan sin OK explícito. En modo autónomo se marcan `BLOQUEADA: requiere aprobación`.
9. **Trazabilidad:** cada commit/PR referencia su `<TICKET_ID>`; conventional commits; sin atribución
   automática de IA. Identidad de commit: `<COMMIT_IDENTITY>`.
10. **Seguí las reglas del repo destino** (`<REPO_CONVENTIONS_FILE>`) cuando existan; este archetype es el
    default, no un override de lo específico del proyecto.
11. **Plantillas de issues:** al crear una issue es OBLIGATORIO usar la plantilla correspondiente de
    `.github/ISSUE_TEMPLATE/` (`task` o `bug`); están prohibidas las issues en blanco o en formato libre.
12. **Plantilla de PR:** al abrir un PR es OBLIGATORIO usar `.github/pull_request_template.md`; están
   prohibidos los PRs sin su estructura. Con GitHub, rellená la plantilla y usá `gh pr create --body-file`.

## Bindings (contrato de proveedores)
Las capacidades del proyecto están **vinculadas a proveedores concretos** en
[`docs/bindings.md`](docs/bindings.md): el proveedor de tareas (`<TASK_TRACKER>`) y el gestor de secretos
(`<SECRETS_PROVIDER>`). Su uso es **OBLIGATORIO y EXCLUSIVO** para cualquier agente; no se usan alternativas.
El **harness** aporta el mecanismo de acceso (MCP / CLI / API); el **spec** aporta el proveedor y sus reglas.
Ese contrato manda sobre cualquier preferencia del agente o del harness.

## Orden de lectura para un agente en frío
1. Este `AGENT.md`. 2. [`docs/bindings.md`](docs/bindings.md) (proveedores obligatorios). 3. `docs/workflow.md`.
4. El ticket activo en `<TRACKER>`. 5. `docs/engineering-handbook.md` para el estándar del cambio concreto.
6. `templates/agent-runbook.md` si operás en modo loop.
7. [`docs/agent-init.md`](docs/agent-init.md) si vas a **inicializar** el proyecto desde la plantilla (modo init).
