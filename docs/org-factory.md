# Factory OS — capa de organización (GitHub)

Cómo esta plantilla se vuelve una fábrica a nivel de organización de GitHub. v1 adopta dos
mecanismos nativos, complementarios.

## 1. Repo `org/.github` — defaults nativos de la organización
Creá un repositorio llamado `.github` en la organización. GitHub sirve sus ficheros de salud
comunitaria (`.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, `SECURITY.md`)
como **default** a cualquier repo de la org que no tenga los suyos. Sembralo copiando las plantillas
de este arquetipo (`.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`).
- Alcance: solo esos ficheros concretos; NO propaga `AGENT.md`/`CLAUDE.md` — para eso, el pin de abajo.

## 2. Template + pin `FACTORY_SPEC`
- Marcá `org/factory` (este arquetipo) como **Template repository** y **etiquetá versiones** (`v1`, `v2`, …).
- Cada proyecto se crea con *Use this template* y declara su baseline en [`AGENT.md`](../AGENT.md):
  `FACTORY_SPEC = org/factory@v1`.
- Regla: el repo se rige por su `FACTORY_SPEC`; el contenido local del repo **sobreescribe** el baseline
  cuando difiere. Para adoptar una versión nueva del spec: re-pinnear `FACTORY_SPEC` y reconciliar cambios.

## Evolución (no incluida en v1)
- Defaults de proveedores fusionados (`factory.defaults.json` en `org/factory`, herencia org ← repo).
- CI como reusable workflows a nivel de org (`uses: org/factory/.github/workflows/<lang>.yml@vX`).
