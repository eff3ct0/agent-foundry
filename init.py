#!/usr/bin/env python3
"""Inicializador del archetype: rellena los <PLACEHOLDER> a partir de un
manifiesto (placeholders.json). Python 3, solo stdlib.

Uso:
  python3 init.py                       # interactivo (pregunta cada placeholder)
  python3 init.py --defaults            # usa los defaults del manifiesto, no pregunta
  python3 init.py --set PROJECT_NAME=Foo --set TEST_CMD='pytest -q'
  python3 init.py --answers answers.json
  python3 init.py --check               # ¿quedan placeholders del manifiesto? (para CI, exit!=0 si sí)
  python3 init.py --dry-run             # muestra qué cambiaría, no escribe
  python3 init.py --self-check          # prueba interna del reemplazo
Opciones: --no-clean (no borrar init.py/placeholders.json/factory_bootstrap.py/MAINTAINERS.md/docs/smoke-test.md/ci/providers/ al final),
          --no-ci (no componer el workflow de CI).

Precedencia de valores: --set  >  --answers  >  prompt interactivo  >  default del manifiesto.
Solo se reemplazan las claves del MANIFIESTO. Los tokens locales de plantilla
(<TICKET_ID>, <CRITERIO_1>, <DATE>, <NNN>, ...) se dejan para rellenar al usar cada template.
Una clave sin valor NO se toca (queda como <KEY> y --check la marca), no se borra.

Política FACTORY_REQUIRED: si FACTORY_REQUIRED=true, init.py falla-cerrado (determinista,
offline) cuando FACTORY_SPEC está vacío. init.py NO verifica ni crea repos de org: el
aprovisionamiento real lo hace `factory_bootstrap.py` (aparte, idempotente, usa `gh`).

Composición de CI: si CI_SYSTEM es GitHub Actions y CI_STACKS trae ecosistemas
(coma-separados: rust, typescript, python, go), se compone .github/workflows/ci.yml
mapeando cada stack a su receta de ci/recipes.json (un job por lenguaje).

Composición de bindings: TASK_TRACKER y SECRETS_PROVIDER (enums) seleccionan un
fragmento del catálogo providers/ (task/ y secrets/) que se compone en
docs/bindings.md — el contrato vinculante de proveedores del proyecto. La forma
abstracta está en providers/task/_contract.md y providers/secrets/_contract.md;
_contract.md nunca se selecciona. Se compone
ANTES de apply_values para que los tokens (<TRACKER_KEY>, <SECRETS_PATH>, ...) se
rellenen dentro del bindings.md recién escrito.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(ROOT, "placeholders.json")
SELF = os.path.basename(__file__)
SKIP_DIRS = {".git"}
SKIP_ROOT_FILES = {SELF, "placeholders.json"}

TRACKER_DISPLAY = {
    "jira": "Jira",
    "github-issues": "GitHub Issues",
    "github-projects": "GitHub Projects",
    "linear": "Linear",
    "custom": "(personalizado)",
}
BINDINGS_HEADER = (
    "# Bindings — proveedores obligatorios de este proyecto\n\n"
    "Estas vinculaciones son de cumplimiento obligatorio para cualquier agente, "
    "sea cual sea su harness.\n"
    "La forma de cada instancia está definida por "
    "providers/task/_contract.md y providers/secrets/_contract.md; "
    "el harness aporta el acceso y el binding aporta las reglas.\n"
)


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)["placeholders"]


def token(key):
    return "<%s>" % key


def iter_text_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if dirpath == root and name in SKIP_ROOT_FILES:
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8") as f:
                    yield path, f.read()
            except (UnicodeDecodeError, OSError, IsADirectoryError):
                continue


def apply_values(root, values, dry_run=False):
    """Reemplaza <KEY> por su valor en cada archivo de texto. `values` trae solo
    claves con valor no vacío. Devuelve {path: nº de tokens reemplazados}."""
    changes = {}
    for path, text in iter_text_files(root):
        n = sum(text.count(token(k)) for k in values)
        if not n:
            continue
        new = text
        for key, val in values.items():
            new = new.replace(token(key), val)
        changes[path] = n
        if not dry_run:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
    return changes


def remaining(root, keys):
    found = {}
    for _, text in iter_text_files(root):
        for key in keys:
            c = text.count(token(key))
            if c:
                found[key] = found.get(key, 0) + c
    return found


def gather(ph, args):
    cli = {}
    for pair in args.set or []:
        if "=" not in pair:
            sys.exit("--set espera KEY=VALUE, recibí: %r" % pair)
        k, v = pair.split("=", 1)
        cli[k.strip()] = v
    answers = {}
    if args.answers:
        with open(args.answers, encoding="utf-8") as f:
            answers = json.load(f)
    values = {}
    for p in ph:
        key = p["key"]
        default = p.get("default", "")
        if key in cli:
            val = cli[key]
        elif key in answers:
            val = str(answers[key])
        elif args.defaults:
            val = default
        else:
            kind = p.get("kind", "")
            shown = default if default else "(vacío)"
            prompt = "%s%s\n  %s\n  [%s] > " % (
                key, (" [%s]" % kind if kind else ""), p.get("prompt", ""), shown)
            try:
                raw = input(prompt).strip()
            except EOFError:
                raw = ""
            val = raw if raw else default
        enum = p.get("enum")
        if enum and val and val not in enum:
            sys.exit("Valor invalido para %s: %s. Opciones: %s" % (key, val, ", ".join(enum)))
        values[key] = val
    missing = [p["key"] for p in ph if p.get("required") and not values.get(p["key"])]
    if missing:
        sys.exit("Faltan placeholders obligatorios: %s" % ", ".join(missing))
    return values


def parse_stacks(value):
    """Valor de CI_STACKS (string coma-separado) -> lista lowercased sin vacíos."""
    return [s.strip().lower() for s in (value or "").split(",") if s.strip()]


def compose_ci(root, stacks, ci_system, dry_run):
    """Compone .github/workflows/ci.yml mapeando cada stack a su receta de
    ci/recipes.json (junto al script). Devuelve (stacks_ok, unknown)."""
    if "github" not in (ci_system or "").lower():
        print("Composición de CI integrada solo para GitHub Actions; "
              "CI_SYSTEM=%s — omito" % ci_system)
        return
    with open(os.path.join(root, "ci", "recipes.json"), encoding="utf-8") as f:
        recipes = json.load(f)
    ok, unknown, blocks = [], [], []
    for s in stacks:
        if s in recipes:
            ok.append(s)
            blocks.append(recipes[s])
        else:
            unknown.append(s)
    if unknown:
        print("Sin receta de CI: %s" % ", ".join(unknown))
    if not blocks:
        print("Ningún stack con receta de CI; omito la composición.")
        return ok, unknown
    content = "name: CI\n\non:\n  push:\n  pull_request:\n\njobs:\n" + "\n".join(blocks) + "\n"
    ok_str = ", ".join(ok)
    if dry_run:
        print("Compondría .github/workflows/ci.yml con jobs: %s" % ok_str)
        return ok, unknown
    wf_dir = os.path.join(root, ".github", "workflows")
    os.makedirs(wf_dir, exist_ok=True)
    with open(os.path.join(wf_dir, "ci.yml"), "w", encoding="utf-8") as f:
        f.write(content)
    print("CI compuesto: .github/workflows/ci.yml (jobs: %s)" % ok_str)
    return ok, unknown


def _binding_fragment(root, capability, name):
    """Ruta al fragmento providers/<capability>/<name>.md; si no existe, avisa y
    cae al custom.md de esa capacidad. `_contract.md` nunca es seleccionable.
    Devuelve la ruta o None si no hay ninguno."""
    frag = os.path.join(root, "providers", capability, "%s.md" % name)
    if name != "_contract" and os.path.exists(frag):
        return frag
    fallback = os.path.join(root, "providers", capability, "custom.md")
    if os.path.exists(fallback):
        print("Sin fragmento providers/%s/%s.md; uso custom.md como fallback." % (capability, name))
        return fallback
    return None


def compose_bindings(root, task_tracker, secrets_provider, dry_run=False):
    """Compone docs/bindings.md = encabezado + fragmento del proveedor de tareas +
    fragmento del gestor de secretos, tomados del catálogo providers/. Devuelve la
    lista de fragmentos usados (testable)."""
    secrets_provider = secrets_provider or "none"
    if dry_run:
        print("Compondría docs/bindings.md (tareas: %s, secretos: %s)" % (task_tracker, secrets_provider))
        return []
    used, parts = [], [BINDINGS_HEADER]
    for capability, name in (("task", task_tracker), ("secrets", secrets_provider)):
        frag = _binding_fragment(root, capability, name)
        if not frag:
            sys.exit("No hay fragmento providers/%s/%s.md ni custom.md de fallback." % (capability, name))
        used.append(frag)
        with open(frag, encoding="utf-8") as f:
            parts.append(f.read().rstrip() + "\n")
    docs_dir = os.path.join(root, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    with open(os.path.join(docs_dir, "bindings.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    print("Bindings compuesto: docs/bindings.md (tareas: %s, secretos: %s)" % (task_tracker, secrets_provider))
    return used


def cleanup(root):
    removed = []
    for f in (SELF, "placeholders.json", "factory_bootstrap.py", "MAINTAINERS.md"):
        p = os.path.join(root, f)
        if os.path.exists(p):
            os.remove(p)
            removed.append(f)
    # Fichero anidado de auto-gobernanza de ESTE repo; no viaja al downstream.
    smoke = os.path.join(root, "docs", "smoke-test.md")
    if os.path.exists(smoke):
        os.remove(smoke)
        removed.append("docs/smoke-test.md")
    for d in ("ci", "providers"):
        dp = os.path.join(root, d)
        if os.path.isdir(dp):
            shutil.rmtree(dp)
            removed.append(d + "/")
    return removed


def self_check():
    d = tempfile.mkdtemp()
    try:
        fp = os.path.join(d, "x.md")
        with open(fp, "w", encoding="utf-8") as f:
            f.write("Proyecto <PROJECT_NAME>, test <TEST_CMD>, intacto <OTRO>.")
        changes = apply_values(d, {"PROJECT_NAME": "Foo/Bar & Co", "TEST_CMD": "pytest -q"})
        out = open(fp, encoding="utf-8").read()
        assert "Foo/Bar & Co" in out and "pytest -q" in out, out
        assert "<PROJECT_NAME>" not in out and "<TEST_CMD>" not in out, out
        assert "<OTRO>" in out, "no debe tocar claves fuera del set"
        assert changes.get(fp) == 2, changes
        assert remaining(d, ["PROJECT_NAME", "OTRO"]) == {"OTRO": 1}, "check por clave"

        d2 = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(d2, "ci"))
            with open(os.path.join(d2, "ci", "recipes.json"), "w", encoding="utf-8") as f:
                json.dump({"aa": "  aa:\n    runs-on: x", "bb": "  bb:\n    runs-on: y"}, f)
            ok, unknown = compose_ci(d2, ["aa", "cc", "bb"], "GitHub Actions", dry_run=False)
            wf = open(os.path.join(d2, ".github", "workflows", "ci.yml"), encoding="utf-8").read()
            assert "name: CI" in wf, wf
            assert "jobs:" in wf, wf
            assert "  aa:" in wf and "  bb:" in wf, wf
            assert ok == ["aa", "bb"], ok
            assert unknown == ["cc"], unknown
        finally:
            shutil.rmtree(d2)

        d3 = tempfile.mkdtemp()
        try:
            for cap, name, body in (
                ("task", "foo", "## Foo\nTareas en Foo."),
                ("secrets", "none", "## Sin gestor\nSin secretos reales."),
            ):
                os.makedirs(os.path.join(d3, "providers", cap), exist_ok=True)
                with open(os.path.join(d3, "providers", cap, "%s.md" % name), "w", encoding="utf-8") as f:
                    f.write(body)
            used = compose_bindings(d3, "foo", "none", dry_run=False)
            bind = open(os.path.join(d3, "docs", "bindings.md"), encoding="utf-8").read()
            assert "# Bindings — proveedores obligatorios de este proyecto" in bind, bind
            assert "providers/task/_contract.md" in bind, bind
            assert "providers/secrets/_contract.md" in bind, bind
            assert "Tareas en Foo." in bind and "Sin secretos reales." in bind, bind
            assert len(used) == 2, used

            with open(os.path.join(d3, "providers", "task", "_contract.md"), "w", encoding="utf-8") as f:
                f.write("NO DEBE COMPONERSE")
            with open(os.path.join(d3, "providers", "task", "custom.md"), "w", encoding="utf-8") as f:
                f.write("FALLBACK CUSTOM")
            assert _binding_fragment(d3, "task", "_contract").endswith("custom.md")
        finally:
            shutil.rmtree(d3)

        print("self-check OK")
    finally:
        shutil.rmtree(d)


def main():
    ap = argparse.ArgumentParser(description="Inicializa el archetype rellenando placeholders.")
    ap.add_argument("--set", action="append", metavar="KEY=VALUE")
    ap.add_argument("--answers", metavar="FILE.json")
    ap.add_argument("--defaults", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-clean", action="store_true")
    ap.add_argument("--no-ci", action="store_true")
    ap.add_argument("--self-check", action="store_true")
    args = ap.parse_args()

    if args.self_check:
        self_check()
        return

    ph = load_manifest()
    keys = [p["key"] for p in ph]

    if args.check:
        rem = remaining(ROOT, keys)
        if rem:
            print("Placeholders del manifiesto sin resolver:")
            for k, c in sorted(rem.items(), key=lambda kv: -kv[1]):
                print("  %s x%d" % (k, c))
            sys.exit(1)
        print("OK: 0 placeholders del manifiesto pendientes.")
        return

    values = gather(ph, args)
    # Prerrequisito determinista (offline): si la fabrica es obligatoria, FACTORY_SPEC no puede estar vacio.
    if str(values.get("FACTORY_REQUIRED", "")).strip().lower() == "true" and not values.get("FACTORY_SPEC", "").strip():
        sys.exit("FACTORY_REQUIRED=true pero FACTORY_SPEC esta vacio: declara el baseline de organizacion (p. ej. org/factory@v1) antes de inicializar.")
    task_tracker = values.get("TASK_TRACKER", "")
    if not values.get("TRACKER") and task_tracker:
        values["TRACKER"] = TRACKER_DISPLAY.get(task_tracker, task_tracker)
    # Componer ANTES de apply_values para que rellene los tokens dentro del bindings.md recién escrito.
    if task_tracker:
        compose_bindings(ROOT, task_tracker, values.get("SECRETS_PROVIDER", ""), args.dry_run)
    stacks = parse_stacks(values.get("CI_STACKS", ""))
    if not args.no_ci and stacks:
        compose_ci(ROOT, stacks, values.get("CI_SYSTEM", ""), args.dry_run)
    nonempty = {k: v for k, v in values.items() if v}
    changes = apply_values(ROOT, nonempty, dry_run=args.dry_run)
    total = sum(changes.values())
    print("%d placeholders %s en %d archivo(s)." % (
        total, "cambiarían" if args.dry_run else "reemplazados", len(changes)))
    for p in sorted(changes):
        print("  %s" % os.path.relpath(p, ROOT))
    rem = remaining(ROOT, keys)
    if rem:
        print("Aún sin resolver (vacíos u omitidos): %s" % ", ".join(sorted(rem)))
    if args.dry_run:
        print("(dry-run: no se escribió nada)")
        return
    if not args.no_clean:
        removed = cleanup(ROOT)
        if removed:
            print("Limpieza: eliminados %s." % ", ".join(removed))
        print("Para empezar con historial propio: rm -rf .git && git init")
    print("Listo. Revisá los archivos y hacé el primer commit del proyecto.")


if __name__ == "__main__":
    main()
