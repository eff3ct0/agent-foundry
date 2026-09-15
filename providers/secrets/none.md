## Sin gestor de secretos

**Vinculación:** Este proyecto NO gestiona secretos reales. Usar solo `.env.example` con valores ficticios; PROHIBIDO introducir secretos reales en el repo o en el entorno del agente.

**Reglas y ciclo:**
- `.env.example` documenta las variables esperadas con valores de ejemplo, nunca reales.
- Si en algún momento hacen falta secretos reales, primero se elige un gestor (Infisical / Vault / Doppler) y se actualiza este binding.

**Prohibiciones:**
- NUNCA commitear un `.env` con valores reales.
- NO pegar credenciales reales en código, config ni en la sesión del agente.
