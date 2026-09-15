#!/usr/bin/env python3
"""start.py — entrypoint de arranque del repo. Detecta el estado y RUTEA.

Es LO PRIMERO que ejecuta un agente al abrir el repo: detecta el modo
(SELF / SETUP / WORK) e imprime la próxima acción. NO ejecuta acciones por sí
mismo (ni init.py, ni git, ni nada hacia afuera): solo detecta e imprime.
Determinista y offline (lee el FS + `git remote get-url origin` local; sin red).

A diferencia de init.py, start.py es PERMANENTE: vive en cada proyecto y NO se
autolimpia (no figura en el cleanup() de init.py).

Uso:
  python3 start.py              # detecta el modo e imprime qué hacer
  python3 start.py --self-check # prueba interna del ruteo (assert-based, sin red)

Modos:
  SELF  — el repo ES el template (desarrollo del arquetipo).
  SETUP — instancia sin inicializar (queda placeholders.json).
  WORK  — proyecto ya inicializado (sin placeholders.json).
"""
import argparse
import os
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_SLUG = "factory-template"
SELF, SETUP, WORK = "SELF", "SETUP", "WORK"

MESSAGES = {
    SELF: (
        "Modo SELF — desarrollo del arquetipo (este repo ES el template).\n"
        "  - NO ejecutes init.py sobre este repo: se auto-consume.\n"
        "  - Seguí MAINTAINERS.md + templates/agent-runbook.md.\n"
        "  - Próximo: elegí el siguiente issue accionable del backlog\n"
        "    (gh issue list -R eff3ct0/factory-template --label type:product / Project #1)\n"
        "    y anunciá 'Trabajando #<n>'."
    ),
    SETUP: (
        "Modo SETUP — instancia sin inicializar (hay placeholders.json).\n"
        "  - Seguí docs/agent-init.md; detectá el stack.\n"
        "  - Corré init.py con --no-clean (para poder verificar con --check).\n"
        "  - Componé bindings + CI; preguntá lo que no puedas inferir.\n"
        "  - Ninguna acción hacia afuera sin OK explícito."
    ),
    WORK: (
        "Modo WORK — proyecto ya inicializado (sin placeholders.json).\n"
        "  - Seguí AGENT.md + templates/agent-runbook.md.\n"
        "  - Próximo: elegí el siguiente ticket accionable del tracker vinculado\n"
        "    (docs/bindings.md) y anunciá 'Trabajando <ID>'."
    ),
}


def _origin_url(root):
    """URL del remote `origin` (git local, sin red) o None si no hay git/remote."""
    try:
        r = subprocess.run(
            ["git", "-C", root, "remote", "get-url", "origin"],
            capture_output=True, text=True,
        )
    except OSError:
        return None  # git no instalado
    return r.stdout.strip() if r.returncode == 0 else None


def _is_template(root, origin_url):
    """¿El repo ES el template? Primario: basename del origin (sin .git) ==
    factory-template. Fallback offline (sin origin): sentinel MAINTAINERS.md, que
    solo existe mientras el repo no se inicializó como proyecto. No se puede usar
    MAINTAINERS.md como primario: una instancia recién clonada del template lo
    tiene igual hasta que corre init.py; el origin es el único discriminador."""
    if origin_url:
        base = origin_url.rstrip("/").rsplit("/", 1)[-1]
        if base.endswith(".git"):
            base = base[:-4]
        return base == TEMPLATE_SLUG
    return os.path.exists(os.path.join(root, "MAINTAINERS.md"))


def detect_mode(root, origin_url):
    """Ruteo determinista: SELF si es el template; si no, SETUP mientras quede
    placeholders.json (instancia sin inicializar) y WORK cuando ya no está."""
    if _is_template(root, origin_url):
        return SELF
    if os.path.exists(os.path.join(root, "placeholders.json")):
        return SETUP
    return WORK


def self_check():
    """Prueba del ruteo con estados simulados (assert-based, sin red ni git):
    llama detect_mode con un origin_url explícito y un root temporal controlado."""
    import shutil
    import tempfile

    d = tempfile.mkdtemp()
    try:
        ph = os.path.join(d, "placeholders.json")
        open(ph, "w").close()
        # (a) placeholders.json + origin factory-template -> SELF (ssh y https).
        assert detect_mode(d, "git@github.com:eff3ct0/factory-template.git") == SELF
        assert detect_mode(d, "https://github.com/eff3ct0/factory-template") == SELF
        # (b) placeholders.json + origin distinto -> SETUP.
        assert detect_mode(d, "git@github.com:eff3ct0/mi-servicio.git") == SETUP
        # sentinel offline: sin origin + placeholders.json, sin MAINTAINERS -> SETUP.
        assert detect_mode(d, None) == SETUP
        # sentinel offline: sin origin + MAINTAINERS.md -> SELF.
        maint = os.path.join(d, "MAINTAINERS.md")
        open(maint, "w").close()
        assert detect_mode(d, None) == SELF
        os.remove(maint)
        os.remove(ph)
        # (c) sin placeholders.json -> WORK (con origin de proyecto y offline).
        assert detect_mode(d, "git@github.com:acme/app.git") == WORK
        assert detect_mode(d, None) == WORK
        print("self-check OK")
    finally:
        shutil.rmtree(d)


def main():
    ap = argparse.ArgumentParser(
        description="Detecta el estado del repo (SELF/SETUP/WORK) e imprime la próxima acción.")
    ap.add_argument("--self-check", action="store_true",
                    help="prueba interna del ruteo (assert-based, sin red)")
    args = ap.parse_args()

    if args.self_check:
        self_check()
        return
    print(MESSAGES[detect_mode(ROOT, _origin_url(ROOT))])


if __name__ == "__main__":
    main()
