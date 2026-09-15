# Modo agente — inicializar un proyecto desde la plantilla

Procedimiento para que un **agente** convierta esta plantilla en un proyecto real:
rellenar los `<PLACEHOLDER>` con criterio, incluido el **mapeo del CI por stack**.
Complementa [`bootstrap.md`](bootstrap.md) (visión general); acá va el paso a paso operativo.

**Precondición:** leé [`AGENT.md`](../AGENT.md) y [`placeholders.json`](../placeholders.json).
`placeholders.json` es la **fuente única** de qué placeholders existen y de su `kind`
(`mechanical` = valor conocido; `judgment` = decisión a justificar).

## Paso 1 — Detectar el stack
- **Greenfield** (repo vacío): preguntá lenguajes/frameworks, gestor de paquetes y comandos base.
- **Brownfield** (repo existente): **inferí** del repo y no preguntes lo que ya está:
  - `Cargo.toml` → `rust`
  - `package.json` / `tsconfig.json` → `typescript`
  - `pyproject.toml` / `requirements.txt` → `python`
  - `go.mod` → `go`
- Derivá `<CI_STACKS>` (coma-separado, p. ej. `rust,typescript`) y los comandos base
  (`<BUILD_CMD>`, `<TEST_CMD>`, `<LINT_CMD>`, `<TYPECHECK_CMD>`, `<RUN_CMD>`) a partir de lo detectado.

## Paso 2 — Elegir proveedores (bindings)
Fijá las **capacidades vinculadas** (contrato de proveedores) antes de rellenar:
- **Tareas:** `<TASK_TRACKER>` (`jira` / `github-issues` / `github-projects` / `linear` / `custom`) y su tablero `<TRACKER_KEY>`.
- **Secretos:** `<SECRETS_PROVIDER>` (`infisical` / `vault` / `doppler` / `none` / `custom`) y su ruta `<SECRETS_PATH>` si aplica.
- **Brownfield:** inferí del repo — `.jira`/config de Jira → `jira`; `.github` (issues o projects) → `github-issues`/`github-projects`; Linear → `linear`; `infisical.json` → `infisical`, `.vault`/config → `vault`, `doppler.yaml` → `doppler`; sin secretos reales → `none`.

Al correr `init.py`, estos enums seleccionan el fragmento del catálogo [`providers/`](../providers/) (task/ y secrets/)
y componen [`docs/bindings.md`](bindings.md). A partir de ahí el agente queda **obligado por ese contrato** (uso exclusivo).

## Paso 3 — Rellenar los mecánicos
Corré el script con los `kind: mechanical` (incluí `TASK_TRACKER`, `SECRETS_PROVIDER`, `CI_STACKS` y `CI_SYSTEM`):

```
python3 init.py --set PROJECT_NAME=<...> --set CI_STACKS=rust,typescript --set CI_SYSTEM='GitHub Actions' ...
```

o con un archivo: `python3 init.py --answers answers.json`.

## Paso 4 — Resolver los `kind: judgment`
Cada uno con **una frase de justificación**; en brownfield, alineados con lo que el repo ya hace:
- `<BRANCHING_MODEL>` — modelo de ramas real del equipo.
- `<TDD_POLICY>` — política de tests que se sostiene en la práctica.
- `<COVERAGE_TARGET>` — objetivo de cobertura realista.
- `<APPROVAL_GATED_ACTIONS>` — acciones difíciles de revertir que exigen OK humano.

## Paso 5 — CI
Al correr `init.py` se compone `.github/workflows/ci.yml` desde `<CI_STACKS>`
(mapeando cada stack a su receta en [`ci/recipes.json`](../ci/recipes.json): un job por lenguaje).
Revisá que los jobs correspondan a los lenguajes reales del proyecto y **ajustá los comandos**
si el proyecto usa scripts propios (p. ej. `make test` en vez de los gates por defecto).

## Paso 6 — Verificar ANTES de la autolimpieza
- `python3 init.py --check` → **0 pendientes** del manifiesto (sale con código ≠0 si queda alguno).
- Los comandos base corren en verde.
- Recordá: los tokens locales de `templates/` (`<TICKET_ID>`, `<CRITERIO_1>`, …) son **intencionales**,
  no placeholders del manifiesto.

## Paso 7 — Finalizar
- Primer commit con conventional commits.
- El script se **autolimpió** (`init.py`, `placeholders.json`, `factory_bootstrap.py`, `MAINTAINERS.md`, `docs/smoke-test.md`, `ci/` y `providers/`); el `ci.yml` y `docs/bindings.md` compuestos quedan.
- No debe quedar ningún `<KEY>` del manifiesto sin resolver.

## Nota anti-error
- **No** rellenes los tokens locales de plantilla; se completan al usar cada `templates/*.md`.
- **No** borres `.git` salvo que quieras historial propio: `rm -rf .git && git init`.

## Feedback al arquetipo
Si al inicializar detectás una carencia o ambigüedad de la PLANTILLA de origen, abrí un issue
`type:dx-feedback` en el repo del template (el de tu `FACTORY_SPEC`). El uso mejora el arquetipo.
