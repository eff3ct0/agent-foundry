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
Opciones: --no-clean (no borrar init.py/placeholders.json al final).

Precedencia de valores: --set  >  --answers  >  prompt interactivo  >  default del manifiesto.
Solo se reemplazan las claves del MANIFIESTO. Los tokens locales de plantilla
(<TICKET_ID>, <CRITERIO_1>, <DATE>, <NNN>, ...) se dejan para rellenar al usar cada template.
Una clave sin valor NO se toca (queda como <KEY> y --check la marca), no se borra.
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
        values[key] = val
    missing = [p["key"] for p in ph if p.get("required") and not values.get(p["key"])]
    if missing:
        sys.exit("Faltan placeholders obligatorios: %s" % ", ".join(missing))
    return values


def cleanup(root):
    removed = []
    for f in (SELF, "placeholders.json"):
        p = os.path.join(root, f)
        if os.path.exists(p):
            os.remove(p)
            removed.append(f)
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
