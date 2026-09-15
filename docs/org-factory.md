# Factory OS — capa de organización (GitHub)

Cómo esta plantilla (`factory-template`) se vuelve una fábrica a nivel de organización de GitHub. v1
adopta dos mecanismos nativos, complementarios.

> **Nomenclatura (template ≠ instancia).** `factory-template` es la **plantilla** (este repo, marcado como
> *Template repository*). `<ORG>/factory` es la **implementación** de la fábrica a nivel de organización:
> se crea a partir de la plantilla, se versiona con tags (`v1`, `v2`, …) y es a donde apuntan los proyectos
> con `FACTORY_SPEC = <ORG>/factory@vX`.

## 1. Repo `org/.github` — defaults nativos de la organización
Creá un repositorio llamado `.github` en la organización. GitHub sirve sus ficheros de salud
comunitaria (`.github/ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, `SECURITY.md`)
como **default** a cualquier repo de la org que no tenga los suyos. Sembralo copiando las plantillas
de esta plantilla (`.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`).
- Alcance: solo esos ficheros concretos; NO propaga `AGENT.md`/`CLAUDE.md` — para eso, el pin de abajo.

## Herramienta de bootstrap (idempotente)
`factory_bootstrap.py` asegura que existan los repos de organización `org/.github` y `org/<factory-repo>`:

- `python3 factory_bootstrap.py --org <ORG> --ensure` — interactivo: pregunta antes de crear lo que falte.
- `--yes` — no interactivo (crea sin preguntar).
- `--no-create` — solo reporta, nunca crea.
- `--plan` — offline: imprime los targets y la intención, sin llamar a `gh`.
- `--factory-repo <nombre>` — nombre del repo de la fábrica (default: `factory`).
- `--visibility public|internal|private` — visibilidad al crear (default: `private`).

Nota: requiere `gh` autenticado; es idempotente (repos existentes → no-op); crear repos es una acción
consentida (por eso `--yes`/prompt). No forma parte de `init.py`.

## 2. Template + pin `FACTORY_SPEC`
- La **plantilla** es este repo (`<ORG>/factory-template`), marcado como **Template repository**.
- La **instancia** `<ORG>/factory` se crea a partir de la plantilla y se **versiona con tags** (`v1`, `v2`, …):
  es el baseline vivo de la organización.
- Cada proyecto se crea con *Use this template* (desde `factory-template`) y declara en [`AGENT.md`](../AGENT.md)
  qué baseline lo rige: `FACTORY_SPEC = <ORG>/factory@v1`.
- Regla: el repo se rige por su `FACTORY_SPEC`; el contenido local del repo **sobreescribe** el baseline
  cuando difiere. Para adoptar una versión nueva del spec: re-pinnear `FACTORY_SPEC` y reconciliar cambios.
- Política: el flag determinista `FACTORY_REQUIRED` (manifiesto) hace que `init.py` falle-cerrado si
  `FACTORY_SPEC` está vacío. La *existencia* del repo la asegura `factory_bootstrap.py`, no `init.py` (que es offline).

## Evolución (no incluida en v1)
- Defaults de proveedores fusionados (`factory.defaults.json` en `org/factory`, herencia org ← repo).
- CI como reusable workflows a nivel de org (`uses: org/factory/.github/workflows/<lang>.yml@vX`).
