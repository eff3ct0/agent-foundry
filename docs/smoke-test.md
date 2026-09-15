# Smoke test del factory (dogfood repetible)

Valida que un agente EN FRÍO, con solo el repo + un empujón mínimo, se auto-inicialice siguiendo el
contrato. Toda fricción → issue `type:dx-feedback` en el repo del template.

## 1. Crear un proyecto desde el template
```
gh repo create <TU_CUENTA>/factory-smoke-test --template eff3ct0/factory-template --private --clone
cd factory-smoke-test
```
(o por UI: "Use this template").

## 2. Kickoff mínimo (sesión de agente NUEVA dentro del repo)
> Sos un agente en frío en este repo, recién creado desde una plantilla de fábrica. Leé CLAUDE.md y
> AGENT.md y seguí docs/agent-init.md para inicializar: rellená los placeholders con init.py (usá
> `--no-clean` para poder verificar), componé bindings y CI, y verificá. Preguntame lo que no puedas
> inferir (nombre, stack, tracker, secretos). No hagas acciones hacia afuera sin mi OK.

Nota: `eff3ct0/factory` (la instancia org) aún no existe → dejá `FACTORY_SPEC` vacío y `FACTORY_REQUIRED=false`.

## 3. Criterios de éxito
- [ ] Arrancó solo con el kickoff mínimo (no hubo que explicarle el proceso).
- [ ] `python3 init.py --check` → 0 placeholders del manifiesto (por eso `--no-clean`).
- [ ] `docs/bindings.md` compuesto con el tracker + secretos elegidos.
- [ ] `.github/workflows/ci.yml` con un job por lenguaje del stack.
- [ ] Sin `--no-clean`: desaparecen `init.py`, `placeholders.json`, `ci/`, `providers/`,
      `factory_bootstrap.py`, `MAINTAINERS.md` y `docs/smoke-test.md` → repo de proyecto limpio.
- [ ] El agente respeta el contrato de loop (una tarea/sesión, estado al tracker, checkpoint, DoD).

## 4. Limpieza
```
gh repo delete <TU_CUENTA>/factory-smoke-test --yes
```

## 5. Feedback (el motor de mejora)
Cualquier punto donde tuviste que intervenir de más, o ambigüedad de `docs/agent-init.md`, abrilo como
issue `type:dx-feedback` en `eff3ct0/factory-template`.
