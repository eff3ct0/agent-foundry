# project-archetype

Plantilla de repositorio **agnóstica** (cualquier lenguaje/stack) que define cómo se ejecuta el trabajo
de desarrollo de software, redactada **para agentes de IA** y legible por humanos. Pensada para usarse
como **GitHub template repository**: creás un repo nuevo a partir de esta estructura y rellenás los
`<PLACEHOLDER>`.

## Qué incluye
- [`AGENT.md`](AGENT.md) — entrypoint principal; reglas operativas y referencias al resto.
- [`docs/workflow.md`](docs/workflow.md) — flujo de trabajo end-to-end.
- [`docs/engineering-handbook.md`](docs/engineering-handbook.md) — estándares de ingeniería.
- [`docs/bootstrap.md`](docs/bootstrap.md) — cómo inicializar un proyecto con esta plantilla.
- [`docs/org-factory.md`](docs/org-factory.md) — capa de organización (repo `.github` + pin `FACTORY_SPEC`).
- [`templates/`](templates/) — ticket, pull request, Definition of Done, ADR, runbook de agente.
- [`.github/`](.github/) — plantillas de issue y pull request para GitHub.
- [`init.py`](init.py) + [`placeholders.json`](placeholders.json) — inicializador (Python 3 stdlib) que
  rellena los placeholders; `placeholders.json` es la fuente única de qué placeholders existen.

## Cómo usarla
1. **Como GitHub template:** marcá este repo como *Template repository* (Settings → Template repository).
   Luego, en cada proyecto nuevo: *Use this template → Create a new repository*.
2. **O por clonado:** copiá el contenido a tu repo nuevo (sin el historial de este).
3. Rellená los `<PLACEHOLDER>` con el inicializador: `python3 init.py` (interactivo) — o dejá que un
   agente corra el script y resuelva los de criterio. Luego elegí tooling y hacé el primer commit.
   Detalle en [`docs/bootstrap.md`](docs/bootstrap.md).

## Convención de placeholders
`<UPPER_SNAKE>` = valor a rellenar. `<!-- guía: … -->` = instrucción para quien rellena. Secciones
marcadas `OPCIONAL` se borran si no aplican. Un proyecto correctamente inicializado no deja `<PLACEHOLDER>`
sin resolver (ver el checklist final de `docs/bootstrap.md`).
