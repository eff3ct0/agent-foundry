# Bindings — proveedores obligatorios de este proyecto

Este archivo se genera al inicializar el arquetipo. En el template no hay aún
un proveedor concreto seleccionado.

La forma de los bindings la definen los contratos abstractos de cada capacidad:

- [`providers/task/_contract.md`](../providers/task/_contract.md)
- [`providers/secrets/_contract.md`](../providers/secrets/_contract.md)
- [`ci/_contract.md`](../ci/_contract.md) para CI

Al inicializar, `init.py` reemplaza este contenido por la instancia concreta de
task y secrets. Los archivos `_contract.md` son especificaciones de forma, no
proveedores ni recetas seleccionables.
