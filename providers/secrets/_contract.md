# Contrato abstracto: proveedor de secretos

Este archivo define la forma obligatoria de una instancia de `secrets`. No es
un proveedor seleccionable y nunca se compone en `docs/bindings.md`.

Todo fragmento `providers/secrets/<proveedor>.md` debe incluir estos campos:

## Identidad

- `Instancia del contrato`: referencia a este archivo.
- `Capacidad`: `secrets`.
- `Proveedor`: nombre del sistema vinculado o `none`.

## Vinculación

Debe indicar dónde viven los secretos y qué ruta, proyecto o mount usa el
proyecto cuando corresponda. Debe dejar claro que el proveedor es obligatorio
y exclusivo, o que no hay secretos reales (`none`).

## Cómo resuelve el agente

Debe distinguir el mecanismo que aporta el harness (MCP, CLI o API) de las
reglas del binding, y explicar cómo localizar, leer y montar o inyectar un
secreto sin exponer su valor.

## Reglas de uso

Debe indicar cuándo puede leer el agente, cómo se usan los secretos en los
comandos y qué configuración o referencia durable debe dejarse en el proyecto.

## Prohibiciones

Debe prohibir secretos en el código, logs, commits, memoria persistente y
proveedores alternativos.
