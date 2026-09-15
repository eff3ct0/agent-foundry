# MAINTAINERS — auto-gobernanza del arquetipo

Este repo (`eff3ct0/factory-template`) se desarrolla bajo su PROPIA doctrina (dogfooding). Esta capa es
concreta y está SEPARADA del **producto** (el contenido de la plantilla con `<PLACEHOLDER>`).

## Regla dura
NO ejecutar `init.py` sobre este repo: se auto-consumiría (rellenaría sus placeholders y borraría el
andamiaje). `init.py`, `placeholders.json`, `providers/`, `ci/`, `factory_bootstrap.py` y las plantillas
son el PRODUCTO, no la config de este repo.

## Bindings de este repo
- **Tareas:** GitHub Issues + GitHub Projects (v2) de `eff3ct0/factory-template`. (El tablero Projects aún
  no existe → crearlo es un ticket `type:product`.)
- **Secretos:** ninguno (template público; sin secretos reales).
- **Contrato de loop:** `templates/agent-runbook.md`. **DoD:** `templates/definition-of-done.md`.

## Tipos de ticket (labels)
- `type:product` — mejoras/cambios del template.
- `type:dx-feedback` — fricción real detectada al USAR el arquetipo (ver `docs/smoke-test.md`).
- `type:bug` — defecto.

## Ciclo de mejora (una tarea por sesión)
1. Tomar un issue accionable (dx-feedback primero si bloquea uso). Anunciar `Trabajando #<n>`.
2. In Progress → cambio mínimo → **verificar** (trinquete): `python3 init.py --self-check`,
   `python3 init.py --check`, un dry-run happy-path, y la auditoría de coherencia cuando se toca estructura.
3. Cumplir la DoD → cerrar el issue con evidencia (commit/PR).
4. Cuando aterriza una tanda coherente → **tag nuevo** (`v1.x` / `v2`) y push.

## Bucle "mejorar mientras se usa"
Cada proyecto bootstrapeado desde el template que pegue con una carencia abre un issue aquí con
`type:dx-feedback` (su `FACTORY_SPEC` registra la procedencia). El uso alimenta el backlog.

## Propagación
`MAINTAINERS.md` y `docs/smoke-test.md` son de ESTE repo; `init.py` los autolimpia en un proyecto
instanciado (no viajan al downstream).
