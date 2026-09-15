# Bootstrap — inicializar un proyecto desde la plantilla

Pasos para convertir esta plantilla en un proyecto real. Al terminar no debe quedar
ningún `<PLACEHOLDER>` sin resolver.

## 1. Crear el repo
- Desde GitHub: *Use this template → Create a new repository*.
- O copiar el contenido a un repo nuevo **sin el historial** de esta plantilla.

## 2. Rellenar todos los `<PLACEHOLDER>`

Dos caminos complementarios; la fuente única de qué placeholders existen es
[`placeholders.json`](../placeholders.json):

- **Script (`init.py`, Python 3 stdlib):** rellena de forma determinista y repetible.
  - Interactivo: `python3 init.py`
  - No interactivo: `python3 init.py --set PROJECT_NAME=Foo --set TEST_CMD='...'`, o `--answers answers.json`, o `--defaults`.
  - `python3 init.py --dry-run` muestra qué cambiaría sin escribir. Al terminar, el script se **autolimpia**
    (borra `init.py` y `placeholders.json`); usá `--no-clean` para conservarlos.
  - Una clave sin valor se deja como `<KEY>` (no se borra), para que el checklist la detecte.
- **Agente:** corre el script para los valores mecánicos y resuelve los `kind: judgment`
  (`<BRANCHING_MODEL>`, `<TDD_POLICY>`, `<COVERAGE_TARGET>`, `<APPROVAL_GATED_ACTIONS>`) por entrevista o
  infiriéndolos de un repositorio existente; ver [`agent-init.md`](agent-init.md) para el procedimiento detallado.
  El CI se compone automáticamente desde `<CI_STACKS>` (un job por lenguaje, ver paso 5).

> Los tokens **locales de plantilla** (`<TICKET_ID>`, `<CRITERIO_1>`, `<DATE>`, `<NNN>`, `<ALTERNATIVA_1>`…)
> NO se rellenan aquí: se completan cada vez que copiás un `templates/*.md`. Por eso no están en el manifiesto.

Dónde viven los valores a rellenar:
- **Coordenadas del proyecto** en [`AGENT.md`](../AGENT.md): `<PROJECT_NAME>`, `<REPO_URLS>`, `<LANGUAGES_AND_FRAMEWORKS>`, `<PACKAGE_MANAGER>`.
- **Comandos base**: `<BUILD_CMD>`, `<TEST_CMD>`, `<LINT_CMD>`, `<TYPECHECK_CMD>`, `<RUN_CMD>`.
- **Tracker**: `<TRACKER>`, `<TRACKER_KEY>`, `<EPIC_ID>`.
- **Ramas**: `<BRANCHING_MODEL>`, `<INTEGRATION_BRANCH>`, `<BRANCH_NAMING>`.
- **Entornos**: `<ENVIRONMENTS>`, `<ENV>`.
- **Identidad de commit**: `<COMMIT_IDENTITY>`.
- **Acciones con aprobación**: `<APPROVAL_GATED_ACTIONS>`.
- **Convenciones del repo destino**: `<REPO_CONVENTIONS_FILE>`.
- Tooling del handbook: `<FORMATTER>`, `<LINTER>`, `<TEST_FRAMEWORK>`, `<TDD_POLICY>`, `<COVERAGE_TARGET>`, `<SCA_TOOL>`, `<CI_SYSTEM>`, `<DEPLOY_METHOD>`, `<OBSERVABILITY_STACK>`.

## 3. Elegir y fijar tooling
- Formatter, linter, test framework y CI concretos del stack.
- Ajustar [`.gitignore`](../.gitignore) al stack (descomentar/añadir lo que aplique).

## 4. Configurar el tracker
- Crear el epic `<EPIC_ID>`.
- Definir labels (`task`, `bug`, …) y estados (To Do / In Progress / Done).

## 5. Configurar CI
- Con GitHub Actions, `init.py` compone `.github/workflows/ci.yml` desde `<CI_STACKS>`
  (un job por lenguaje, recetas en [`ci/recipes.json`](../ci/recipes.json)). Revisá que los jobs
  correspondan al stack real y ajustá los comandos si el proyecto usa scripts propios.
- Con otro `<CI_SYSTEM>`: pipeline manual con los gates del handbook: format, lint, typecheck, test, build.

## 6. Primer commit y protección de rama
- Commit inicial con conventional commits.
- Proteger `<INTEGRATION_BRANCH>` (review requerido, CI en verde para mergear).

## 7. Checklist "listo"
- [ ] 0 placeholders sin resolver.
- [ ] Comandos base corren (`<BUILD_CMD>`, `<TEST_CMD>`, `<TYPECHECK_CMD>`).
- [ ] CI en verde.
- [ ] `AGENT.md` coherente con el proyecto real.

### Detectar placeholders pendientes
- **Durante el bootstrap** (antes de la autolimpieza), canónico y apto como gate de CI (sale con código ≠0
  si queda alguno del manifiesto):
  ```
  python3 init.py --check
  ```
- **En el proyecto ya inicializado** (init.py ya no está), verificación rápida — recordá que los tokens
  locales en `templates/` son intencionales:
  ```
  rg "<[A-Z_]+>" .      # o: grep -rn "<[A-Z_]\+>" . --include=*.md
  ```
