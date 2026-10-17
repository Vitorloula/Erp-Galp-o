# agentes/tools.py
"""
Tools sandboxed para os agentes. Sem estas tools, os agentes só produzem texto.
Toda escrita é restrita a src/, public/ e arquivos específicos da raiz.
"""
import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

from crewai.tools import tool

RAIZ_PROJETO = Path(__file__).resolve().parent.parent
DIR_MEMORIA = RAIZ_PROJETO / "memoria"
DIRETORIOS_PERMITIDOS = {"src", "public", "memoria"}
ARQUIVOS_RAIZ_PERMITIDOS = {
    "GUIA_DE_TESTES.md",
    "DOCUMENTACAO_ERP.md",
    "memoria_projeto.md",
    "relatorio_melhorias.md",
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "tailwind.config.js",
    "postcss.config.js",
}
PADROES_SECRETOS = [
    r"SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['\"][^'\"]+['\"]",
    r"sk-[A-Za-z0-9]{20,}",
    r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}",
]


def _caminho_seguro(rel_path: str) -> Path:
    alvo = (RAIZ_PROJETO / rel_path).resolve()
    try:
        alvo.relative_to(RAIZ_PROJETO)
    except ValueError:
        raise ValueError(f"❌ Acesso negado: {rel_path} fora do projeto.")
    partes = alvo.relative_to(RAIZ_PROJETO).parts
    if not partes:
        raise ValueError(f"❌ Caminho inválido: {rel_path}")
    if partes[0] in DIRETORIOS_PERMITIDOS:
        return alvo
    if len(partes) == 1 and partes[0] in ARQUIVOS_RAIZ_PERMITIDOS:
        return alvo
    raise ValueError(f"❌ Escrita não permitida em: {rel_path}")


def _contem_segredo(texto: str) -> str | None:
    for padrao in PADROES_SECRETOS:
        if re.search(padrao, texto):
            return padrao
    return None


# ------------------------------------------------------------------ #
# Leitura / escrita
# ------------------------------------------------------------------ #
@tool("ler_arquivo")
def ler_arquivo(caminho: str) -> str:
    """Lê um arquivo do projeto (path relativo à raiz)."""
    try:
        alvo = _caminho_seguro(caminho)
        if not alvo.exists():
            return f"⚠️ Não encontrado: {caminho}"
        return alvo.read_text(encoding="utf-8")
    except Exception as e:
        return f"❌ {e}"


@tool("escrever_arquivo")
def escrever_arquivo(caminho: str, conteudo: str) -> str:
    """Cria/sobrescreve arquivo. Bloqueia segredos vazados."""
    try:
        segredo = _contem_segredo(conteudo)
        if segredo:
            return f"🚫 BLOQUEADO: conteúdo contém possível segredo ({segredo})."
        alvo = _caminho_seguro(caminho)
        alvo.parent.mkdir(parents=True, exist_ok=True)
        alvo.write_text(conteudo, encoding="utf-8")
        return f"✅ Salvo: {caminho} ({len(conteudo)} chars)"
    except Exception as e:
        return f"❌ {e}"


@tool("listar_arquivos")
def listar_arquivos(subpasta: str = "src") -> str:
    """Lista arquivos de uma subpasta (ex: 'src', 'src/components')."""
    try:
        base = (RAIZ_PROJETO / subpasta).resolve()
        base.relative_to(RAIZ_PROJETO)
        if not base.exists():
            return f"⚠️ Pasta não encontrada: {subpasta}"
        itens = sorted(
            str(p.relative_to(RAIZ_PROJETO))
            for p in base.rglob("*")
            if p.is_file() and "node_modules" not in p.parts
        )
        return "\n".join(itens[:300]) or "(vazio)"
    except Exception as e:
        return f"❌ {e}"


@tool("buscar_no_codigo")
def buscar_no_codigo(padrao: str, subpasta: str = "src") -> str:
    """Grep simples no código."""
    try:
        base = (RAIZ_PROJETO / subpasta).resolve()
        base.relative_to(RAIZ_PROJETO)
        resultados = []
        for p in base.rglob("*"):
            if not p.is_file() or "node_modules" in p.parts:
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
        return f"❌ {e}"


# ------------------------------------------------------------------ #
# Execução segura
# ------------------------------------------------------------------ #
@tool("rodar_comando_npm")
def rodar_comando_npm(comando: str) -> str:
    """Roda comando npm/npx seguro (install, tsc, vitest, run, build, lint)."""
    partes = comando.strip().split()
    if not partes:
        return "❌ Comando vazio."
    if partes[0].lower() not in {"npm", "npx"}:
        return f"❌ Apenas npm/npx. Recebido: {partes[0]}"
    bloqueados = {"publish", "exec", "link", "unlink", "adduser", "login"}
    if any(t in bloqueados for t in partes[1:]):
        return f"❌ Bloqueado: {comando}"
    try:
        r = subprocess.run(
            partes, cwd=RAIZ_PROJETO, capture_output=True, text=True, 
            encoding="utf-8", errors="replace", timeout=600, shell=True
        )
        return f"[exit={r.returncode}]\n{(r.stdout or '') + (r.stderr or '')}".strip()[-5000:]
    except subprocess.TimeoutExpired:
        return "❌ Timeout (10min)."
    except Exception as e:
        return f"❌ {e}"


# ------------------------------------------------------------------ #
# Memória estruturada (backlog + estado)
# ------------------------------------------------------------------ #
@tool("ler_estado_projeto")
def ler_estado_projeto() -> str:
    """Retorna o estado estruturado do projeto (memoria/estado.json) em JSON."""
    arq = DIR_MEMORIA / "estado.json"
    if not arq.exists():
        return json.dumps({"backlog": [], "concluidos": [], "ciclos": 0}, ensure_ascii=False)
    try:
        return arq.read_text(encoding="utf-8")
    except Exception as e:
        return f"❌ {e}"


@tool("atualizar_backlog")
def atualizar_backlog(acao: str, item_id: str, dados_json: str = "{}") -> str:
    """Atualiza o backlog persistente (adicionar/concluir/remover/reordenar)."""
    DIR_MEMORIA.mkdir(exist_ok=True)
    arq = DIR_MEMORIA / "estado.json"
    estado = {"backlog": [], "concluidos": [], "ciclos": 0}
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
        dados.setdefault("id", item_id)
        dados.setdefault("criado_em", datetime.now().isoformat())
        estado["backlog"] = [b for b in estado["backlog"] if b.get("id") != item_id] + [dados]
    elif acao == "concluir":
        item = next((b for b in estado["backlog"] if b.get("id") == item_id), None)
        estado["backlog"] = [b for b in estado["backlog"] if b.get("id") != item_id]
        if item:
            item["concluido_em"] = datetime.now().isoformat()
            estado["concluidos"].append(item)
    elif acao == "remover":
        estado["backlog"] = [b for b in estado["backlog"] if b.get("id") != item_id]
    elif acao == "reordenar":
        try:
            nova_ordem = json.loads(dados_json)
            mapa = {b["id"]: b for b in estado["backlog"]}
            estado["backlog"] = [mapa[i] for i in nova_ordem if i in mapa]
        except Exception as e:
            return f"❌ reordenar falhou: {e}"
    else:
        return f"❌ ação desconhecida: {acao}"

    arq.write_text(json.dumps(estado, indent=2, ensure_ascii=False), encoding="utf-8")
    return f"✅ Backlog atualizado ({acao}: {item_id}). Tamanho: {len(estado['backlog'])} pendentes."


@tool("registrar_ciclo")
def registrar_ciclo(resumo: str) -> str:
    """Append-only: registra o resultado de um ciclo em memoria/historico.md."""
    DIR_MEMORIA.mkdir(exist_ok=True)
    arq = DIR_MEMORIA / "historico.md"
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    with arq.open("a", encoding="utf-8") as f:
        f.write(f"\n## [{ts}] Ciclo\n{resumo.strip()}\n")
    return f"✅ Ciclo registrado em memoria/historico.md"