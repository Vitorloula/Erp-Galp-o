# agents/core.py
"""
Núcleo compartilhado da fábrica — configuração, ambiente, git, dependências e métricas.

Tudo aqui é determinístico (não fala com LLM). Evita a duplicação que existia entre
main.py, melhorar.py e corrigir_e2e.py, e centraliza decisões como modelo, timeouts
e medição de custo.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import traceback
from datetime import datetime
from pathlib import Path

# Força UTF-8 no stdout/stderr: evita UnicodeEncodeError em consoles Windows (cp1252)
# quando a fábrica imprime emojis/logs acentuados. Sem efeito onde já é UTF-8 (CI Linux).
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
DIR_MEMORIA = RAIZ_PROJETO / "memoria"
ARQ_METRICAS = DIR_MEMORIA / "metricas.jsonl"

LLM_KEYS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY")


# ------------------------------------------------------------------ #
# Configuração central (tudo via env, com defaults sensatos)
# ------------------------------------------------------------------ #
class Config:
    """Lê a configuração da fábrica de variáveis de ambiente."""

    def __init__(self) -> None:
        self.max_ciclos = int(os.getenv("MAX_CICLOS", "3"))
        self.max_correcoes = int(os.getenv("MAX_CORRECOES", "2"))
        self.timeout_global_s = int(os.getenv("TIMEOUT_GLOBAL_S", str(50 * 60)))
        self.max_ciclos_sem_progresso = int(os.getenv("MAX_CICLOS_SEM_PROGRESSO", "2"))
        self.base_branch = os.getenv("BASE_BRANCH", "saas")
        # Modelo padrão dos agentes. None = usa o default do CrewAI (OPENAI_MODEL_NAME).
        self.modelo = os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL_NAME") or None


# ------------------------------------------------------------------ #
# Log
# ------------------------------------------------------------------ #
def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ------------------------------------------------------------------ #
# Ambiente / executáveis
# ------------------------------------------------------------------ #
def resolver_executavel(cmd: str) -> str:
    """Windows: npx → npx.cmd, npm → npm.cmd. Linux/Mac: path normal.

    Se não resolver, devolve o próprio nome para que o subprocess dispare
    FileNotFoundError (e o chamador classifique como 'ambiente quebrado').
    """
    resolvido = shutil.which(cmd)
    if resolvido:
        return resolvido
    if sys.platform == "win32":
        for ext in (".cmd", ".bat", ".exe"):
            candidato = shutil.which(cmd + ext)
            if candidato:
                return candidato
    return cmd


def tem_llm() -> bool:
    return any(os.getenv(k) for k in LLM_KEYS)


def validar_ambiente(raiz: Path | None = None) -> None:
    """Aborta (sys.exit 1) se faltar LLM key, package.json/tsconfig ou npx/npm executáveis."""
    raiz = raiz or RAIZ_PROJETO
    faltas: list[str] = []
    if not tem_llm():
        faltas.append("Nenhuma LLM key (OPENAI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY)")
    for arq in ("package.json", "tsconfig.json"):
        if not (raiz / arq).exists():
            faltas.append(f"{arq} não encontrado na raiz")

    # Testa npx/npm de verdade (resolve .cmd no Windows)
    for tool_name in ("npx", "npm"):
        caminho = shutil.which(tool_name)
        if not caminho:
            faltas.append(f"{tool_name} não encontrado no PATH")
            continue
        try:
            r = subprocess.run(
                [caminho, "--version"], capture_output=True, text=True, timeout=15, shell=False,
            )
            if r.returncode != 0:
                faltas.append(f"{tool_name} --version falhou (exit {r.returncode})")
        except Exception as e:
            faltas.append(f"{tool_name} não executa: {type(e).__name__}: {e}")

    if faltas:
        for f in faltas:
            print(f"❌ {f}")
        sys.exit(1)
    log("✅ Ambiente validado (npx/npm executam).")


# ------------------------------------------------------------------ #
# Git
# ------------------------------------------------------------------ #
def detectar_branch(repo, base_preferida: str = "saas") -> str:
    """Prefere a base configurada ('saas'), senão a ativa, senão main/master."""
    heads = [h.name for h in repo.heads]
    if base_preferida in heads:
        return base_preferida
    try:
        return repo.active_branch.name
    except TypeError:
        for nome in ("main", "master"):
            if nome in heads:
                return nome
        return "main"


def preparar_git(repo, base_preferida: str = "saas") -> tuple[str, str]:
    """Cria (ou reseta) a branch de trabalho da sessão. Retorna (nova, original)."""
    original = detectar_branch(repo, base_preferida)
    repo.git.checkout(original)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    nova = f"ia-autonoma/{ts}"
    repo.git.checkout("-B", nova)  # -B = cria ou reseta
    log(f"🌿 Branch: {nova} (a partir de {original})")
    return nova, original


def snapshot_commit(repo, msg: str) -> str | None:
    """Commita tudo se houver mudança. Retorna o sha ou None."""
    try:
        repo.git.add(A=True)
        if not repo.is_dirty(untracked_files=True):
            return None
        c = repo.index.commit(msg)
        return c.hexsha
    except Exception:
        traceback.print_exc()
        return None


def rollback_para(repo, commit_sha: str) -> None:
    try:
        repo.git.reset("--hard", commit_sha)
        repo.git.clean("-fd")
        log(f"↩️ Rollback para {commit_sha[:8]}")
    except Exception:
        traceback.print_exc()


# ------------------------------------------------------------------ #
# Dependências npm
# ------------------------------------------------------------------ #
def _lockfile_mudou(raiz: Path) -> bool:
    """True se package-lock.json mudou desde HEAD."""
    try:
        r = subprocess.run(
            ["git", "diff", "--quiet", "HEAD", "--", "package-lock.json"],
            cwd=raiz, shell=False, capture_output=True,
        )
        return r.returncode != 0
    except Exception:
        return True  # em dúvida, instala


def instalar_deps(raiz: Path | None = None, force: bool = False) -> bool:
    """npm ci só se o lockfile mudou (ou force=True)."""
    raiz = raiz or RAIZ_PROJETO
    if not force and not _lockfile_mudou(raiz):
        return True
    log("📦 npm ci...")
    try:
        npm_exe = resolver_executavel("npm")
        r = subprocess.run(
            [npm_exe, "ci", "--no-audit", "--no-fund"],
            cwd=raiz, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=600, shell=False,
        )
        if r.returncode != 0:
            print((r.stderr or r.stdout)[-2000:])
            return False
        return True
    except subprocess.TimeoutExpired:
        return False
    except Exception:
        traceback.print_exc()
        return False


# ------------------------------------------------------------------ #
# Métricas / custo
# ------------------------------------------------------------------ #
# Preço em USD por 1M tokens: (entrada, saída). Melhor esforço; modelo fora da
# tabela → custo fica None, mas os tokens continuam sendo registrados.
# Atualize conforme a tabela de preços do seu provedor.
PRECOS_USD_POR_1M: dict[str, tuple[float, float]] = {
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "o1": (15.00, 60.00),
    "o3": (2.00, 8.00),
    "o3-mini": (1.10, 4.40),
    "o4-mini": (1.10, 4.40),
    "deepseek-chat": (0.27, 1.10),
    "deepseek-reasoner": (0.55, 2.19),
}


def _preco_do_modelo(modelo: str | None) -> tuple[float, float] | None:
    if not modelo:
        return None
    base = modelo.lower().rsplit("/", 1)[-1].strip()
    if base in PRECOS_USD_POR_1M:
        return PRECOS_USD_POR_1M[base]
    for chave, preco in PRECOS_USD_POR_1M.items():
        if base.startswith(chave):
            return preco
    return None


def calcular_custo(
    prompt_tokens: int | None, completion_tokens: int | None, modelo: str | None,
) -> float | None:
    if prompt_tokens is None and completion_tokens is None:
        return None
    preco = _preco_do_modelo(modelo)
    if not preco:
        return None
    entrada, saida = preco
    p = prompt_tokens or 0
    c = completion_tokens or 0
    return (p / 1_000_000) * entrada + (c / 1_000_000) * saida


def extrair_uso(crew, modelo: str | None = None) -> dict:
    """Extrai tokens + custo estimado de uma execução CrewAI."""
    um = getattr(crew, "usage_metrics", None)
    if um is None:
        return {}
    prompt = getattr(um, "prompt_tokens", None)
    completion = getattr(um, "completion_tokens", None)
    total = getattr(um, "total_tokens", None)
    custo = getattr(um, "total_cost", None)
    if custo in (None, 0):
        custo = calcular_custo(prompt, completion, modelo)
    return {
        "tokens": total,
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "custo_usd": custo,
    }


def registrar_metricas(ciclo: int, resultado: dict) -> None:
    try:
        ARQ_METRICAS.parent.mkdir(exist_ok=True)
        with ARQ_METRICAS.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "ts": datetime.now().isoformat(),
                "ciclo": ciclo,
                **resultado,
            }, ensure_ascii=False) + "\n")
    except Exception:
        traceback.print_exc()
