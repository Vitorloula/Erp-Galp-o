# agentes/qa_gate.py
"""
Gate mecânico de qualidade — sem LLM.
Retorna: True (passou), False (teste falhou), None (ambiente indisponível).
"""
import re
import subprocess
from pathlib import Path

from core import resolver_executavel as _resolver_exe


def _git_diff(raiz: Path, alvo: str) -> str:
    try:
        r = subprocess.run(
            ["git", "diff", "HEAD", "--", alvo],
            cwd=raiz, capture_output=True, text=True, timeout=30, shell=False,
        )
        return r.stdout or ""
    except Exception:
        return ""


def validar_diff_e2e(raiz: Path) -> list[str]:
    diff = _git_diff(raiz, "e2e/")
    if not diff.strip():
        return []
    problemas = []
    for m in re.finditer(r"^\+.*\.(skip|only)\s*\(", diff, re.M):
        linha = m.group(0).strip()
        if not any(x in linha for x in ("skipIf", "skipOnMobile", "skipOnDesktop")):
            problemas.append(f"❌ Teste com skip/only: {linha[:120]}")
    for m in re.finditer(r"^\+.*expect\(\s*await\s+[^)]*\.count\(\)\s*\)", diff, re.M):
        problemas.append(f"❌ count() sem auto-wait: {m.group(0).strip()[:120]}")
    for m in re.finditer(r"^\+.*toast\([^,]+,\s*/[^/\n]*\\\([A-Z]\\d", diff, re.M):
        problemas.append(f"❌ Regex de toast com código dinâmico: {m.group(0).strip()[:120]}")
    return problemas


def validar_diff_package_json(raiz: Path) -> list[str]:
    diff = _git_diff(raiz, "package.json")
    if not diff.strip():
        return []
    problemas = []
    for m in re.finditer(
        r'^\+\s*"(dev|build|test[^"]*|pre[^"]*|post[^"]*)"\s*:', diff, re.M
    ):
        problemas.append(f"⚠️ package.json script alterado: {m.group(0).strip()[:120]}")
    return problemas


def _rodar(raiz: Path, cmd: list[str], nome: str, timeout: int) -> tuple[bool | None, str]:
    """True=OK, False=teste falhou, None=ambiente indisponível (não é bug do código)."""
    cmd_resolvido = [_resolver_exe(cmd[0])] + cmd[1:]
    try:
        r = subprocess.run(
            cmd_resolvido, cwd=raiz, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout, shell=False,
        )
        log = f"=== {nome} (exit={r.returncode}) ===\n{(r.stdout or '')}\n{(r.stderr or '')}"
        return r.returncode == 0, log
    except FileNotFoundError as e:
        return None, f"=== {nome} AMBIENTE INDISPONÍVEL: {e} ==="
    except subprocess.TimeoutExpired:
        return False, f"=== {nome} TIMEOUT ({timeout}s) ==="
    except Exception as e:
        return False, f"=== {nome} ERRO: {type(e).__name__}: {e} ==="


def testes_rapidos(raiz: Path) -> tuple[bool | None, str]:
    """tsc + vitest + build. None = ambiente quebrado (não tenta correção)."""
    logs = []
    for cmd, nome, tmo in [
        (["npx", "tsc", "--noEmit", "-p", "tsconfig.json"], "tsc", 180),
        (["npx", "vitest", "run", "--reporter=dot"], "vitest", 300),
        (["npm", "run", "build"], "vite build", 300),
    ]:
        ok, log = _rodar(raiz, cmd, nome, tmo)
        logs.append(log)
        if ok is None:
            return None, "\n".join(logs)
        if not ok:
            return False, "\n".join(logs)
    return True, "\n".join(logs)


def testes_completos(raiz: Path) -> tuple[bool | None, str]:
    ok, log_rapidos = testes_rapidos(raiz)
    if ok is None:
        return None, log_rapidos
    if not ok:
        return False, log_rapidos
    ok_e2e, log_e2e = _rodar(
        raiz,
        ["npx", "playwright", "test", "--project=app-computador", "--reporter=line"],
        "playwright E2E",
        timeout=900,
    )
    return ok_e2e, log_rapidos + "\n" + log_e2e


def gate_mecanico(raiz: Path) -> tuple[bool, str]:
    problemas = validar_diff_e2e(raiz) + validar_diff_package_json(raiz)
    if problemas:
        return False, "\n".join(problemas)
    return True, ""


def _tem_mudanca(raiz: Path, alvos: list[str]) -> bool:
    """True se há mudança (rastreada ou não) nos paths alvo desde HEAD."""
    try:
        r = subprocess.run(
            ["git", "diff", "HEAD", "--", *alvos],
            cwd=raiz, capture_output=True, text=True, timeout=30, shell=False,
        )
        if (r.stdout or "").strip():
            return True
        r2 = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", *alvos],
            cwd=raiz, capture_output=True, text=True, timeout=30, shell=False,
        )
        return bool((r2.stdout or "").strip())
    except Exception:
        return True  # em dúvida, não bloqueia


def gate_implementacao(raiz: Path) -> tuple[bool, str]:
    """Garante que o ciclo de fato mexeu no código (src/e2e/public)."""
    if _tem_mudanca(raiz, ["src", "e2e", "public"]):
        return True, ""
    return False, "Nenhuma mudança de código (src/e2e/public) — o item não foi implementado."