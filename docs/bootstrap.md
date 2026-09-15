# Bootstrap — inicializar un proyecto desde la plantilla

Pasos para convertir esta plantilla en un proyecto real. Al terminar no debe quedar
ningún `<PLACEHOLDER>` sin resolver.

## 1. Crear el repo
- Desde GitHub: *Use this template → Create a new repository*.
- O copiar el contenido a un repo nuevo **sin el historial** de esta plantilla.

## 2. Rellenar todos los `<PLACEHOLDER>`
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
- Pipeline en `<CI_SYSTEM>` con los gates del handbook: format, lint, typecheck, test, build.

## 6. Primer commit y protección de rama
- Commit inicial con conventional commits.
- Proteger `<INTEGRATION_BRANCH>` (review requerido, CI en verde para mergear).

## 7. Checklist "listo"
- [ ] 0 placeholders sin resolver.
- [ ] Comandos base corren (`<BUILD_CMD>`, `<TEST_CMD>`, `<TYPECHECK_CMD>`).
- [ ] CI en verde.
- [ ] `AGENT.md` coherente con el proyecto real.

### Detectar placeholders pendientes
```
grep -rn "<[A-Z_]\+>" . --include=*.md
```
(o con ripgrep: `rg "<[A-Z_]+>"`)
