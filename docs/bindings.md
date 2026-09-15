# Bindings - mandatory project providers

This file is generated when the archetype is initialized. The template has no
concrete provider selected yet.

The shape of bindings is defined by the abstract capability contracts:

- [`providers/task/_contract.md`](../providers/task/_contract.md)
- [`providers/secrets/_contract.md`](../providers/secrets/_contract.md)
- [`ci/_contract.md`](../ci/_contract.md) for CI

During initialization, `init.py` replaces this content with the selected task
and secrets instances. `_contract.md` files define shape; they are not selectable
providers or recipes.
