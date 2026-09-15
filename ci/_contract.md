# Contrato abstracto: receta de CI

Este archivo define la forma obligatoria de una instancia de CI. No es una
receta ni un job seleccionable: `init.py` solo selecciona claves de
`ci/recipes.json`, por lo que este archivo nunca se compone en el workflow.

Cada receta de `ci/recipes.json` debe producir un job YAML autocontenido y
marcado como instancia de este contrato.

## Identidad

- `Instancia del contrato`: referencia a este archivo en el comentario de la receta.
- `Capacidad`: `ci`.
- `Ecosistema`: stack o lenguaje que cubre la receta.

## Ejecución

Debe declarar un job reproducible sobre un runner soportado, hacer checkout del
código y fijar las herramientas o versiones necesarias para ejecutarlo.

## Gates obligatorios

Debe cubrir los gates aplicables al ecosistema: formato, lint, typecheck, test
y build. Si uno no aplica, la receta debe omitirlo de forma explícita mediante
la convención del ecosistema, no sustituirlo por un comando arbitrario.

## Fallos y trazabilidad

Los comandos deben propagar errores y el job debe ser una señal de verificación
para el merge. La clave de la receta y el ecosistema deben ser identificables en
el workflow generado.

## Exclusión

`_contract.md` no es una clave de `recipes.json` y no puede convertirse en un
job.
