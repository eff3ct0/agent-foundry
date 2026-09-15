# Manual de ingeniería

Estándares como checklists. Agnóstico; rellenar `<UPPER_SNAKE>` en el bootstrap.

## Código
- [ ] Formateo con `<FORMATTER>` y lint con `<LINTER>` en verde.
- [ ] Naming consistente y descriptivo.
- [ ] Archivos y funciones acotados (una responsabilidad clara).
- [ ] Comentarios explican el **porqué**, no el qué.

## Testing
- [ ] Framework: `<TEST_FRAMEWORK>`.
- [ ] Pirámide: muchos unitarios, algunos de integración, pocos e2e.
- [ ] Política TDD: `<TDD_POLICY>`.
- [ ] Cobertura objetivo: `<COVERAGE_TARGET>`.
- [ ] Al menos **un check runnable** por lógica no trivial (rama, loop, parser, dinero, seguridad).

## Seguridad
- [ ] Validar entradas en las **fronteras de confianza**.
- [ ] Secretos fuera del repo (variables de entorno / gestor de secretos).
- [ ] Dependencias auditadas con `<SCA_TOOL>`.
- [ ] Authz en cada endpoint/acción sensible.
- [ ] Revisar OWASP para el tipo de cambio.
- [ ] **Nunca** loguear secretos ni PII.

## CI/CD
- [ ] `<CI_SYSTEM>` con gates: format, lint, typecheck, test, build.
- [ ] Merge bloqueado si algún gate falla.
- [ ] Despliegue vía `<DEPLOY_METHOD>`.

## Arquitectura
- [ ] Límites de módulos explícitos.
- [ ] Dependencias apuntan hacia el dominio (no al revés).
- [ ] Decisiones significativas registradas como ADR → [`templates/adr.md`](../templates/adr.md).

## Documentación
- [ ] README actualizado.
- [ ] Changelog al día.
- [ ] ADRs para decisiones relevantes.
- [ ] Comentarios de intención donde el código no se explica solo.

## Observabilidad
- [ ] Stack: `<OBSERVABILITY_STACK>`.
- [ ] Logs útiles, con contexto y sin ruido.
- [ ] Métricas/alertas para lo que importa.

## Datos y migraciones
- [ ] Aditivas y reversibles.
- [ ] Retrocompatibles con datos existentes.
- [ ] **Requieren aprobación humana** (`<APPROVAL_GATED_ACTIONS>`).
