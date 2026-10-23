# agentes/tools.py
"""Tools sandboxed. Leitura ampla; escrita restrita a whitelist."""
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path

from crewai.tools import tool

from core import resolver_executavel as _resolver_exe

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
DIR_MEMORIA = RAIZ_PROJETO / "memoria"

DIRETORIOS_PERMITIDOS_ESCRITA = {"src", "public", "memoria", "e2e"}
ARQUIVOS_RAIZ_PERMITIDOS_ESCRITA = {
    "GUIA_DE_TESTES.md", "DOCUMENTACAO_ERP.md", "relatorio_melhorias.md",
    "REGRAS_E2E.md", "package.json", "tsconfig.json", "vite.config.ts",
    "playwright.config.ts", "tailwind.config.js", "postcss.config.js",
}
LEITURA_BLOQUEADA_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__"}

PADROES_SECRETOS = [
    r"SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['\"][^'\"]{10,}['\"]",
    r"\bsk-[A-Za-z0-9]{20,}",
    r"\bsk-ant-[A-Za-z0-9_-]{20,}",
    r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}",
    r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
]

COMANDOS_PERMITIDOS = [
    ("npm", "ci"), ("npm", "install"),
    ("npm", "run", "build"), ("npm", "run", "test"),
    ("npm", "run", "test:sql"), ("npm", "run", "test:e2e"), ("npm", "run", "lint"),
    ("npx", "tsc"), ("npx", "vitest"), ("npx", "playwright"), ("npx", "eslint"),
]


# ------------------------------------------------------------------ #
# Helpers internos (não são tools)
# ------------------------------------------------------------------ #
def _dentro_projeto(alvo: Path) -> tuple[Path, tuple]:
    try:
        alvo.relative_to(RAIZ_PROJETO)
    except ValueError:
        raise ValueError("❌ Acesso negado: fora do projeto.")
    partes = alvo.relative_to(RAIZ_PROJETO).parts
    if not partes:
        raise ValueError("❌ Caminho inválido.")
    return alvo, partes


def _caminho_leitura(rel_path: str) -> Path:
    """Leitura: qualquer arquivo do projeto, exceto .env/.git/node_modules/.venv."""
    alvo = (RAIZ_PROJETO / rel_path).resolve()
    alvo, partes = _dentro_projeto(alvo)
    if partes[0] in LEITURA_BLOQUEADA_DIRS:
        raise ValueError(f"❌ Leitura bloqueada: {rel_path}")
    if alvo.name == ".env":
        raise ValueError(f"❌ Leitura bloqueada: {rel_path}")
    return alvo


def _caminho_escrita(rel_path: str) -> Path:
    """Escrita: só whitelist de diretórios/arquivos."""
    alvo = (RAIZ_PROJETO / rel_path).resolve()
    alvo, partes = _dentro_projeto(alvo)
    if partes[0] in DIRETORIOS_PERMITIDOS_ESCRITA:
        return alvo
    if len(partes) == 1 and partes[0] in ARQUIVOS_RAIZ_PERMITIDOS_ESCRITA:
        return alvo
    raise ValueError(f"❌ Escrita não permitida em: {rel_path}")


def _contem_segredo(texto: str) -> str | None:
    for padrao in PADROES_SECRETOS:
        if re.search(padrao, texto):
            return padrao
    return None


def _comando_permitido(partes: list[str]) -> bool:
    for cmd in COMANDOS_PERMITIDOS:
        if tuple(partes[: len(cmd)]) == cmd:
            return True
    return False


# ------------------------------------------------------------------ #
# Arquivos
# ------------------------------------------------------------------ #
@tool("ler_arquivo")
def ler_arquivo(caminho: str) -> str:
    """Lê um arquivo do projeto (path relativo à raiz). Aceita qualquer arquivo exceto .env/.git/node_modules/.venv."""
    try:
        alvo = _caminho_leitura(caminho)
        if not alvo.exists():
            return f"⚠️ Não encontrado: {caminho}"
        return alvo.read_text(encoding="utf-8")
    except Exception as e:
        return f"{e}"


@tool("escrever_arquivo")
def escrever_arquivo(caminho: str, conteudo: str) -> str:
    """Cria/sobrescreve arquivo (whitelist: src/, public/, e2e/, memoria/ e alguns arquivos da raiz). Bloqueia segredos."""
    try:
        segredo = _contem_segredo(conteudo)
        if segredo:
            return f"🚫 BLOQUEADO: conteúdo contém possível segredo ({segredo})."
        alvo = _caminho_escrita(caminho)
        alvo.parent.mkdir(parents=True, exist_ok=True)
        alvo.write_text(conteudo, encoding="utf-8")
        return f"✅ Salvo: {caminho} ({len(conteudo)} chars)"
    except Exception as e:
        return f"{e}"


@tool("listar_arquivos")
def listar_arquivos(subpasta: str = "src") -> str:
    """Lista arquivos de uma subpasta (ex: 'src', 'e2e/app', 'agents')."""
    try:
        base = (RAIZ_PROJETO / subpasta).resolve()
        base.relative_to(RAIZ_PROJETO)
        if not base.exists():
            return f"⚠️ Pasta não encontrada: {subpasta}"
        itens = sorted(
            str(p.relative_to(RAIZ_PROJETO))
            for p in base.rglob("*")
            if p.is_file() and not any(x in p.parts for x in LEITURA_BLOQUEADA_DIRS)
        )
        return "\n".join(itens[:300]) or "(vazio)"
    except Exception as e:
        return f"{e}"


@tool("buscar_no_codigo")
def buscar_no_codigo(padrao: str, subpasta: str = "src") -> str:
    """Grep simples: procura 'padrao' em arquivos .ts/.tsx/.js/.jsx/.css/.json/.md sob 'subpasta'."""
    try:
        base = (RAIZ_PROJETO / subpasta).resolve()
        base.relative_to(RAIZ_PROJETO)
        resultados = []
        for p in base.rglob("*"):
            if not p.is_file() or any(x in p.parts for x in LEITURA_BLOQUEADA_DIRS):
                continue
            if p.suffix not in {".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md"}:
                continue
            try:
                for i, linha in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
                    if padrao in linha:
                        resultados.append(f"{p.relative_to(RAIZ_PROJETO)}:{i}: {linha.strip()}")
            except Exception:
                continue
        return "\n".join(resultados[:150]) or "(nenhum resultado)"
    except Exception as e:
        return f"{e}"


# ------------------------------------------------------------------ #
# Execução segura (whitelist + sem shell=True + resolve .cmd)
# ------------------------------------------------------------------ #
@tool("rodar_comando_npm")
def rodar_comando_npm(comando: str) -> str:
    """Roda comando npm/npx (whitelist: ci, install, run build/test/test:e2e/lint, npx tsc/vitest/playwright/eslint). Resolve .cmd no Windows."""
    partes = comando.strip().split()
    if not partes:
        return "❌ Comando vazio."
    if partes[0].lower() not in {"npm", "npx"}:
        return f"❌ Apenas npm/npx. Recebido: {partes[0]}"
    if not _comando_permitido(partes):
        return f"❌ Comando não permitido pela whitelist: {comando}"
    cmd_resolvido = [_resolver_exe(partes[0])] + partes[1:]
    try:
        r = subprocess.run(
            cmd_resolvido, cwd=RAIZ_PROJETO, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=900, shell=False,
        )
        return f"[exit={r.returncode}]\n{(r.stdout or '') + (r.stderr or '')}".strip()[-5000:]
    except FileNotFoundError as e:
        return f"❌ AMBIENTE: executável não encontrado ({e}). Verifique se Node está no PATH."
    except subprocess.TimeoutExpired:
        return "❌ Timeout (15min)."
    except Exception as e:
        return f"❌ {type(e).__name__}: {e}"


# ------------------------------------------------------------------ #
# Memória estruturada (backlog + plano + histórico)
# ------------------------------------------------------------------ #
@tool("ler_estado_projeto")
def ler_estado_projeto() -> str:
    """Retorna o estado estruturado do projeto em JSON (memoria/estado.json): backlog, concluidos, ciclos, plano_atual."""
    arq = DIR_MEMORIA / "estado.json"
    if not arq.exists():
        return json.dumps(
            {"backlog": [], "concluidos": [], "ciclos": 0, "plano_atual": None},
            ensure_ascii=False,
        )
    try:
        return arq.read_text(encoding="utf-8")
    except Exception as e:
        return f"{e}"


@tool("atualizar_backlog")
def atualizar_backlog(acao: str, item_id: str = "", dados_json: str = "{}") -> str:
    """Atualiza o backlog persistente. Ações: 'adicionar' (dados_json=item ou lista de itens), 'concluir' (item_id), 'remover' (item_id), 'reordenar' (dados_json=array de ids). 'reordenar' NUNCA apaga: move os ids citados para a frente e mantém o resto no fim."""
    DIR_MEMORIA.mkdir(exist_ok=True)
    arq = DIR_MEMORIA / "estado.json"
    estado = {"backlog": [], "concluidos": [], "ciclos": 0, "plano_atual": None}
    if arq.exists():
        try:
            estado = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            pass
    try:
        dados = json.loads(dados_json) if dados_json else {}
    except json.JSONDecodeError:
        return f"❌ dados_json inválido: {dados_json}"

    if acao == "adicionar":
        itens = dados if isinstance(dados, list) else [dados]
        for d in itens:
            if not isinstance(d, dict):
                continue
            d.setdefault("id", item_id)
            if not d.get("id"):
                continue  # sem id não adiciona
            d.setdefault("criado_em", datetime.now().isoformat())
            # dedupe por id e append — nunca reduz o backlog
            estado["backlog"] = [b for b in estado["backlog"] if b.get("id") != d["id"]] + [d]
    elif acao == "concluir":
        if not item_id:
            return "❌ concluir exige item_id."
        item = next((b for b in estado["backlog"] if b.get("id") == item_id), None)
        estado["backlog"] = [b for b in estado["backlog"] if b.get("id") != item_id]
        if item:
            item["concluido_em"] = datetime.now().isoformat()
            estado["concluidos"].append(item)
    elif acao == "remover":
        if not item_id:
            return "❌ remover exige item_id."
        estado["backlog"] = [b for b in estado["backlog"] if b.get("id") != item_id]
    elif acao == "reordenar":
        try:
            nova_ordem = json.loads(dados_json)
            if not isinstance(nova_ordem, list):
                return "❌ reordenar: dados_json deve ser uma lista de ids."
        except Exception as e:
            return f"❌ reordenar falhou: {e}"
        mapa = {b["id"]: b for b in estado["backlog"]}
        citados = [mapa[i] for i in nova_ordem if i in mapa]
        vistos = set(nova_ordem)
        restantes = [b for b in estado["backlog"] if b.get("id") not in vistos]
        estado["backlog"] = citados + restantes  # NUNCA apaga
    else:
        return f"❌ ação desconhecida: {acao}"

    arq.write_text(json.dumps(estado, indent=2, ensure_ascii=False), encoding="utf-8")
    return f"✅ Backlog ({acao}: {item_id}). Tamanho: {len(estado['backlog'])} pendentes."


@tool("definir_plano")
def definir_plano(item_id: str, objetivo: str, arquivos_json: str = "[]", criterios: str = "") -> str:
    """Persiste o plano do ciclo atual em estado.json (campo plano_atual). arquivos_json deve ser um array JSON de paths."""
    DIR_MEMORIA.mkdir(exist_ok=True)
    arq = DIR_MEMORIA / "estado.json"
    estado = {"backlog": [], "concluidos": [], "ciclos": 0, "plano_atual": None}
    if arq.exists():
        try:
            estado = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            pass
    try:
        arquivos = json.loads(arquivos_json)
        if not isinstance(arquivos, list):
            arquivos = [str(arquivos)]
    except json.JSONDecodeError:
        return f"❌ arquivos_json inválido: {arquivos_json}"
    if not item_id:
        return "❌ item_id obrigatório."
    estado["plano_atual"] = {
        "item_id": item_id,
        "objetivo": objetivo,
        "arquivos_alvo": arquivos,
        "criterios_aceite": criterios,
        "criado_em": datetime.now().isoformat(),
    }
    arq.write_text(json.dumps(estado, indent=2, ensure_ascii=False), encoding="utf-8")
    return f"✅ Plano salvo: item={item_id}, arquivos={len(arquivos)}."


@tool("registrar_ciclo")
def registrar_ciclo(resumo: str) -> str:
    """Append-only: registra o resultado de um ciclo em memoria/historico.md. Nunca apaga entradas antigas."""
    DIR_MEMORIA.mkdir(exist_ok=True)
    arq = DIR_MEMORIA / "historico.md"
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    with arq.open("a", encoding="utf-8") as f:
        f.write(f"\n## [{ts}] Ciclo\n{resumo.strip()}\n")
    return "✅ Ciclo registrado em memoria/historico.md"


@tool("registrar_falha")
def registrar_falha(motivo: str, diff: str = "", log_testes: str = "") -> str:
    """Persiste uma falha de ciclo em memoria/falhas/ para consulta futura. Útil antes de rollback."""
    DIR_MEMORIA.mkdir(exist_ok=True)
    pasta = DIR_MEMORIA / "falhas"
    pasta.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    (pasta / f"{ts}.md").write_text(
        f"# Falha em {ts}\n\n## Motivo\n{motivo}\n\n"
        f"## Diff\n```diff\n{diff[:5000]}\n```\n\n"
        f"## Log\n```\n{log_testes[-5000:]}\n```\n",
        encoding="utf-8",
    )
    return f"✅ Falha registrada em memoria/falhas/{ts}.md"