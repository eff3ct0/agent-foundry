#!/usr/bin/env python3
"""factory_bootstrap.py — aprovisionamiento idempotente de los repos de organización.

Verifica (y crea los que falten) los repos base de una organización de GitHub:
`<org>/.github` (defaults de salud comunitaria) y `<org>/<factory-repo>` (el template
de la fábrica). Usa el CLI `gh`. Es SEPARADO de init.py (que es determinista/offline):
init.py solo declara/impone la política FACTORY_REQUIRED; la existencia real de los
repos la asegura esta herramienta.

Uso:
  python3 factory_bootstrap.py --org <ORG> --ensure     # verifica y crea lo que falte (pregunta antes)
  python3 factory_bootstrap.py --org <ORG> --yes        # no interactivo: crea sin preguntar
  python3 factory_bootstrap.py --org <ORG> --no-create  # solo reporta, nunca crea
  python3 factory_bootstrap.py --plan --org <ORG>       # OFFLINE: imprime el plan, sin llamar a gh
  Opciones: --factory-repo <nombre> (default: factory), --visibility public|private (default: private).

Requiere `gh` autenticado (salvo --plan). Idempotente: repos existentes -> no-op. NUNCA borra.
"""
import argparse
import sys

# nota: crear repos en una organización es una acción hacia afuera y consentida (por eso --yes / prompt); esta herramienta NO se corre desde init.py.


def targets(org, factory_repo):
    return ["%s/.github" % org, "%s/%s" % (org, factory_repo)]


def plan(org, factory_repo):
    """OFFLINE: imprime los targets y la intención. No importa ni llama a subprocess."""
    print("Plan (offline) para org %s:" % org)
    for t in targets(org, factory_repo):
        print("  verificaria/aseguraria %s (idempotente; requiere gh autenticado)" % t)
    return 0


def _preflight():
    import shutil
    import subprocess
    if not shutil.which("gh"):
        sys.exit("gh no esta en PATH: instala GitHub CLI (https://cli.github.com) y corre `gh auth login`.")
    if subprocess.run(["gh", "auth", "status"], capture_output=True).returncode != 0:
        sys.exit("gh no esta autenticado: corre `gh auth login` antes de aprovisionar repos de org.")


def _gh(*args):
    import subprocess
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def _consent(target):
    try:
        return input("Crear %s? [y/N] " % target).strip().lower() in ("y", "yes")
    except EOFError:
        return False  # no interactivo sin --yes => no se crea (fail-closed hacia afuera)


def ensure(org, factory_repo, visibility, no_create, yes):
    _preflight()
    existentes, creados, omitidos, faltantes = [], [], [], []
    for t in targets(org, factory_repo):
        if _gh("repo", "view", t).returncode == 0:
            print("ok: %s ya existe" % t)
            existentes.append(t)
            continue
        if no_create:
            print("falta: %s (no se crea)" % t)
            faltantes.append(t)
            continue
        if not (yes or _consent(t)):
            print("omitido: %s" % t)
            omitidos.append(t)
            continue
        res = _gh("repo", "create", t, "--%s" % visibility)
        if res.returncode == 0:
            print("creado: %s" % t)
            creados.append(t)
        elif "already exists" in (res.stderr or "").lower():
            print("ok: %s ya existe" % t)  # idempotente: create sobre repo existente = no-op
            existentes.append(t)
        else:
            print("error: %s (fallo al crear: %s)" % (t, (res.stderr or "").strip()))
            faltantes.append(t)
    print("Resumen: existentes=%d creados=%d omitidos=%d faltantes=%d" % (
        len(existentes), len(creados), len(omitidos), len(faltantes)))
    return 0 if not (omitidos or faltantes) else 1


def main():
    ap = argparse.ArgumentParser(
        description="Asegura (idempotente) los repos de organización <org>/.github y <org>/<factory-repo> via gh.")
    ap.add_argument("--org", help="nombre de la organización (requerido salvo --plan/--help)")
    ap.add_argument("--factory-repo", default="factory", help="nombre del repo de la fábrica (default: factory)")
    ap.add_argument("--ensure", action="store_true", help="verifica y crea los que falten (acción por defecto)")
    ap.add_argument("--no-create", action="store_true", help="solo reporta, nunca crea")
    ap.add_argument("--yes", action="store_true", help="no interactivo: crea sin preguntar")
    ap.add_argument("--visibility", default="private", choices=["public", "private", "internal"],
                    help="visibilidad al crear (default: private)")
    ap.add_argument("--plan", action="store_true", help="OFFLINE: imprime el plan sin llamar a gh ni a la red")
    args = ap.parse_args()

    if not args.plan and not args.org:
        ap.error("--org es requerido (salvo --plan)")

    if args.plan:
        sys.exit(plan(args.org, args.factory_repo))
    sys.exit(ensure(args.org, args.factory_repo, args.visibility, args.no_create, args.yes))


if __name__ == "__main__":
    main()
