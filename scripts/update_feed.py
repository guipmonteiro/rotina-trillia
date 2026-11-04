#!/usr/bin/env python3
"""
Robô que atualiza data/feed.json com:
  - notícias do mercado de financiamento de veículos e imóveis (Google Notícias RSS);
  - normas: Banco Central (Resoluções CMN/BCB), Diário Oficial da União, Câmara, Senado
    e atos (Contran, Senatran, Detrans, CVM, CNJ) noticiados na imprensa;
  - indicadores do Banco Central (SGS).

Só usa a biblioteca padrão do Python. Cada fonte é independente: se uma falhar,
as demais seguem e o erro fica registrado em feed["fontes"].

Uso:  python3 scripts/update_feed.py [--dry-run]
"""
from __future__ import annotations

import datetime as dt
import email.utils
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEED = ROOT / "data" / "feed.json"
CONFIG = ROOT / "config" / "monitor.json"
UA = "Mozilla/5.0 (compatible; RotinaTrilliaFeedBot/1.0; +https://github.com)"
TODAY = dt.datetime.now(dt.timezone.utc)

# --------------------------------------------------------------------------- utilidades


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url: str, *, accept: str = "*/*", retries: int = 2, timeout: int = 25) -> bytes:
    last = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "pt-BR,pt;q=0.9"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"{url[:90]}… -> {last}")


def get_json(url: str):
    return json.loads(get(url, accept="application/json").decode("utf-8", "replace"))


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def hid(*parts: str) -> str:
    return hashlib.sha1("|".join(norm(p) for p in parts).encode()).hexdigest()[:14]


def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def iso_from_rfc822(s: str) -> str | None:
    try:
        return email.utils.parsedate_to_datetime(s).astimezone(dt.timezone.utc).isoformat()
    except Exception:  # noqa: BLE001
        return None


def iso_from_br(s: str) -> str | None:
    """dd/mm/aaaa -> aaaa-mm-dd"""
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def first_key(d: dict, *needles: str, deep: bool = False):
    """Primeiro valor cuja chave contém um dos trechos (procura também um nível abaixo se deep=True)."""
    for n in needles:
        for k, v in d.items():
            if n in k.lower() and v not in (None, "") and not isinstance(v, (dict, list)):
                return v
    if deep:
        for v in d.values():
            if isinstance(v, dict):
                r = first_key(v, *needles)
                if r not in (None, ""):
                    return r
    return None


ORGS = ["CMN", "BCB", "Contran", "CVM", "Senatran", "CNJ"]


def canonical_kind(kind: str, title: str = "") -> str:
    k = re.sub(r"\s+", " ", kind or "Ato").strip()
    k = k[0].upper() + k[1:].lower() if k else "Ato"
    for org in ORGS:
        if org.lower() in k.lower():
            k = re.sub(org, org, k, flags=re.I)
    if k.lower() in ("resolução", "resolucao", "portaria", "instrução normativa", "provimento", "circular"):
        for org in ORGS:
            if re.search(rf"\b{org}\b", title or "", re.I):
                return f"{k} {org}"
    return k


def norm_id(kind: str, number: str, title: str = "") -> str:
    core = re.sub(r"\D", "", (number or "").split("/")[0])
    return "n-" + hid(canonical_kind(kind, title), core)


TOPIC_RULES = [
    ("trillia", ["trillia", "tabela auto b3"]),
    ("veiculos", ["veicul", "automove", "carro", "moto", "gravame", "renave", "renavam", "detran", "contran", "senatran", "concessionari"]),
    ("imoveis", ["imobili", "imove", "habitac", "sfh", "sfi", "poupanca", "abecip", "minha casa", "registro de imoveis", "onr", "home equity"]),
    ("garantias", ["garantia", "fiduciari", "hipotec"]),
    ("credito", ["juros", "selic", "credito", "inadimpl", "spread"]),
]


def topic_of(text: str, default: str) -> str:
    t = norm(text)
    for topic, keys in TOPIC_RULES:
        if any(k in t for k in keys):
            return topic
    return default


ACT_RE = re.compile(
    r"(?P<kind>Resolu[cç][aã]o(?:\s+(?:CMN|BCB|Contran|CONTRAN|CVM|Conjunta))?|Portaria(?:\s+\w+)?|Lei Complementar|Lei|Decreto(?:-Lei)?|"
    r"Medida Provis[oó]ria|Instru[cç][aã]o Normativa|Provimento|Circular|Delibera[cç][aã]o)\s*(?:n[ºo°.]*\s*)?(?P<num>\d{1,3}(?:\.\d{3})*(?:/\d{2,4})?)",
    re.I,
)

# --------------------------------------------------------------------------- fontes


def google_news(q: str, days: int):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": f"{q} when:{days}d", "hl": "pt-BR", "gl": "BR", "ceid": "BR:pt-419"}
    )
    root = ET.fromstring(get(url, accept="application/rss+xml"))
    out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src_el = it.find("source")
        source = (src_el.text or "").strip() if src_el is not None else ""
        if source and title.endswith(" - " + source):
            title = title[: -(len(source) + 3)]
        desc = strip_tags(it.findtext("description") or "")
        nd, nt = norm(desc), norm(title)
        if not nd or nd[:40] in nt or nt[:40] in nd or (source and nd.endswith(norm(source)) and len(nd) - len(norm(source)) < len(nt) + 5):
            desc = ""
        out.append({
            "title": title,
            "url": (it.findtext("link") or "").strip(),
            "source": source,
            "date": iso_from_rfc822(it.findtext("pubDate") or ""),
            "summary": desc[:280] if desc and desc != source else "",
        })
    return out


def bcb_normativos(q: str, days: int):
    start = (TODAY - dt.timedelta(days=days)).strftime("%Y-%m-%d")
    end = TODAY.strftime("%Y-%m-%d")
    params = {
        "querytext": f"ContentType:normativo AND contentSource:normativos AND {q}",
        "rowlimit": "15",
        "startrow": "0",
        "sortlist": "Data1OWSDATE:descending",
        "refinementfilters": f"Data:range(datetime({start}),datetime({end}))",
    }
    data = get_json("https://www.bcb.gov.br/api/search/app/normativos/buscanormativos?" + urllib.parse.urlencode(params))
    rows = data.get("Rows") or data.get("rows") or []
    out = []
    for r in rows:
        tipo = first_key(r, "tipodonormativo", "tipo") or "Normativo"
        numero = str(first_key(r, "numero") or "").split(".")[0]
        data_ = first_key(r, "data1owsdate", "data") or ""
        assunto = strip_tags(str(first_key(r, "assunto") or r.get("title") or ""))
        date = str(data_)[:10] if re.match(r"\d{4}-\d{2}-\d{2}", str(data_)) else iso_from_br(str(data_))
        if not numero:
            continue
        link = "https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?" + urllib.parse.urlencode({"tipo": tipo, "numero": numero})
        out.append({"kind": canonical_kind(str(tipo)), "number": numero, "title": assunto[:300] or f"{tipo} {numero}", "date": date, "url": link, "source": "Banco Central"})
    return out


def dou(q: str):
    url = "https://www.in.gov.br/consulta/-/buscar/dou?" + urllib.parse.urlencode({"q": q, "s": "todos", "exactDate": "ano", "sortType": "0"})
    page = get(url, accept="text/html").decode("utf-8", "replace")
    m = re.search(r'<script[^>]+id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params"[^>]*>(.*?)</script>', page, re.S)
    if not m:
        raise RuntimeError("estrutura da página do DOU mudou")
    items = json.loads(m.group(1)).get("jsonArray", [])
    out = []
    for it in items[:20]:
        title = strip_tags(it.get("title") or it.get("titulo") or "")
        mm = ACT_RE.search(title)
        kind = canonical_kind(mm.group("kind") if mm else (it.get("artType") or "Ato"), title)
        out.append({
            "kind": kind,
            "number": mm.group("num") if mm else "",
            "title": title[:200],
            "ementa": strip_tags(it.get("content") or "")[:400],
            "date": iso_from_br(it.get("pubDate") or ""),
            "url": "https://www.in.gov.br/web/dou/-/" + (it.get("urlTitle") or ""),
            "source": "DOU · " + strip_tags(it.get("hierarchyStr") or it.get("pubName") or "")[:80],
        })
    return out


def camara(q: str, days: int, known: dict):
    start = (TODAY - dt.timedelta(days=days)).strftime("%Y-%m-%d")
    params = {"keywords": q, "dataApresentacaoInicio": start, "ordem": "DESC", "ordenarPor": "id", "itens": "12", "siglaTipo": "PL,PLP,MPV,PDL,PEC"}
    data = get_json("https://dadosabertos.camara.leg.br/api/v2/proposicoes?" + urllib.parse.urlencode(params))
    out = []
    for p in data.get("dados", []):
        pid = str(p.get("id"))
        nid = "camara-" + pid
        date, status = None, ""
        if nid in known:
            date, status = known[nid].get("date"), known[nid].get("status", "")
        else:
            try:
                det = get_json(f"https://dadosabertos.camara.leg.br/api/v2/proposicoes/{pid}").get("dados", {})
                date = (det.get("dataApresentacao") or "")[:10] or None
                status = (det.get("statusProposicao") or {}).get("descricaoSituacao") or ""
            except Exception as e:  # noqa: BLE001
                log("  camara detalhe", pid, e)
        out.append({
            "id": nid,
            "kind": f"{p.get('siglaTipo')}",
            "number": f"{p.get('numero')}/{p.get('ano')}",
            "title": (p.get("ementa") or "").strip()[:300],
            "date": date or f"{p.get('ano')}-01-01",
            "status": status,
            "url": f"https://www.camara.leg.br/propostas-legislativas/{pid}",
            "source": "Câmara dos Deputados",
        })
    return out


def _walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)


def senado(q: str, days: int):
    start = (TODAY - dt.timedelta(days=days)).strftime("%Y%m%d")
    url = "https://legis.senado.leg.br/dadosabertos/materia/pesquisa/lista?" + urllib.parse.urlencode({"palavraChave": q, "dataInicioApresentacao": start})
    data = get_json(url)
    out, seen = [], set()
    for d in _walk(data):
        cod = d.get("Codigo") or d.get("CodigoMateria")
        ementa = first_key(d, "ementa")
        if not cod or not isinstance(ementa, str) or cod in seen:
            continue
        seen.add(cod)
        sigla = first_key(d, "siglasubtipo", "sigla", deep=True) or "Matéria"
        numero = first_key(d, "numeromateria", "numero", deep=True) or ""
        ano = first_key(d, "anomateria", "ano", deep=True) or ""
        date = first_key(d, "dataapresentacao", "data", deep=True)
        out.append({
            "id": f"senado-{cod}",
            "kind": str(sigla),
            "number": f"{numero}/{ano}".strip("/"),
            "title": ementa.strip()[:300],
            "date": str(date)[:10] if date else None,
            "url": f"https://www25.senado.leg.br/web/atividade/materias/-/materia/{cod}",
            "source": "Senado Federal",
        })
    return out[:12]


def sgs(code: int):
    data = get_json(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados/ultimos/1?formato=json")
    return data[-1] if data else None


# --------------------------------------------------------------------------- principal


def main(dry: bool = False):
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    old = json.loads(FEED.read_text(encoding="utf-8")) if FEED.exists() else {}
    fontes: dict[str, str] = {}

    # ---------------- Notícias
    news_cfg = cfg["noticias"]
    news: dict[str, dict] = {n["id"]: n for n in old.get("news", [])}
    ok = 0
    for b in news_cfg["buscas"]:
        try:
            for n in google_news(b["q"], news_cfg["dias"]):
                if not n["title"] or not n["url"]:
                    continue
                n["id"] = hid(n["title"])
                n["topic"] = topic_of(n["title"] + " " + n.get("summary", ""), b["tema"])
                if n["id"] in news:
                    continue
                news[n["id"]] = n
                ok += 1
            time.sleep(0.6)
        except Exception as e:  # noqa: BLE001
            log("news", b["q"], e)
            fontes["Google Notícias"] = f"erro parcial: {e}"[:160]
    fontes.setdefault("Google Notícias", f"ok (+{ok})")

    cutoff = (TODAY - dt.timedelta(days=news_cfg["dias"] + 15)).isoformat()
    news_list = [n for n in news.values() if n.get("keep") or (n.get("date") or "9999") >= cutoff]
    news_list.sort(key=lambda n: n.get("date") or "", reverse=True)
    news_list = news_list[: news_cfg["maximo"]]

    # ---------------- Normas
    ncfg = cfg["normas"]
    normas: dict[str, dict] = {n["id"]: n for n in old.get("normas", [])}
    now_iso = TODAY.isoformat()

    def add_norm(n: dict, tema: str):
        if not n.get("title"):
            return 0
        if "id" not in n:
            n["id"] = norm_id(n.get("kind", ""), n["number"], n["title"]) if n.get("number") else "t-" + hid(n["title"])
        n["topic"] = n.get("topic") or topic_of(f"{n['title']} {n.get('ementa', '')}", tema)
        if n["id"] in normas:
            # atualiza situação de PLs
            if n.get("status"):
                normas[n["id"]]["status"] = n["status"]
            return 0
        n["firstSeen"] = now_iso
        normas[n["id"]] = n
        return 1

    for name, fn, items in (
        ("Banco Central", lambda b: bcb_normativos(b["q"], ncfg["dias"]), ncfg.get("bcb", [])),
        ("Diário Oficial", lambda b: dou(b["q"]), ncfg.get("dou", [])),
        ("Câmara", lambda b: camara(b["q"], ncfg["dias"], normas), ncfg.get("camara", [])),
        ("Senado", lambda b: senado(b["q"], ncfg["dias"]), ncfg.get("senado", [])),
    ):
        added, err = 0, ""
        for b in items:
            try:
                for n in fn(b):
                    added += add_norm(n, b["tema"])
                time.sleep(0.5)
            except Exception as e:  # noqa: BLE001
                log(name, b["q"], e)
                err = str(e)[:140]
        fontes[name] = f"ok (+{added})" if not err else f"erro: {err} (+{added})"

    # Atos noticiados na imprensa (Contran, Senatran, Detrans, CVM, CNJ…)
    added, err = 0, ""
    for b in ncfg.get("google_news", []):
        try:
            for it in google_news(b["q"], 60):
                m = ACT_RE.search(it["title"])
                if not m:
                    continue
                kind = canonical_kind(m.group("kind"), it["title"])
                n = {
                    "id": norm_id(kind, m.group("num"), it["title"]),
                    "kind": kind,
                    "number": m.group("num"),
                    "title": it["title"],
                    "ementa": it.get("summary", ""),
                    "date": (it.get("date") or "")[:10] or None,
                    "url": it["url"],
                    "source": f"Imprensa · {it.get('source', '')}",
                    "origin": "imprensa",
                }
                added += add_norm(n, b["tema"])
            time.sleep(0.6)
        except Exception as e:  # noqa: BLE001
            log("normas-news", b["q"], e)
            err = str(e)[:140]
    fontes["Atos na imprensa"] = f"ok (+{added})" if not err else f"erro: {err} (+{added})"

    ncut = (TODAY - dt.timedelta(days=ncfg["dias"] + 30)).strftime("%Y-%m-%d")
    norm_list = [n for n in normas.values() if n.get("keep") or (n.get("date") or "9999") >= ncut]
    norm_list.sort(key=lambda n: (n.get("date") or "", n.get("firstSeen") or ""), reverse=True)
    norm_list = norm_list[:400]

    # ---------------- Indicadores
    inds = []
    for s in cfg.get("indicadores", []):
        try:
            v = sgs(s["codigo"])
            if not v:
                continue
            val = float(str(v["valor"]).replace(",", "."))
            inds.append({
                "id": f"sgs-{s['codigo']}",
                "label": s["nome"],
                "value": f"{val:.{s.get('casas', 2)}f}".replace(".", ","),
                "unit": s["unidade"],
                "date": v.get("data"),
                "url": f"https://www3.bcb.gov.br/sgspub/consultarvalores/telaCvsSelecionarSeries.paint?serie={s['codigo']}",
            })
        except Exception as e:  # noqa: BLE001
            log("sgs", s["codigo"], e)
            fontes["Banco Central SGS"] = f"erro: {str(e)[:120]}"
    fontes.setdefault("Banco Central SGS", f"ok ({len(inds)})")
    if not inds:
        inds = old.get("indicadores", [])

    feed = {
        "updatedAt": old.get("updatedAt"),
        "checkedAt": now_iso,
        "fontes": fontes,
        "news": news_list,
        "normas": norm_list,
        "indicadores": inds,
        "agenda": old.get("agenda", []),
    }
    comparable = lambda f: json.dumps({k: f.get(k) for k in ("news", "normas", "indicadores", "agenda")}, sort_keys=True, ensure_ascii=False)  # noqa: E731
    changed = comparable(feed) != comparable(old)
    if changed:
        feed["updatedAt"] = now_iso
    log(f"notícias: {len(news_list)} · normas: {len(norm_list)} · indicadores: {len(inds)}")
    log(json.dumps(fontes, ensure_ascii=False, indent=1))
    if dry:
        print(json.dumps(feed, ensure_ascii=False, indent=1)[:3000])
        return
    if not changed:
        log("Sem novidades; feed mantido.")
        return
    FEED.parent.mkdir(parents=True, exist_ok=True)
    FEED.write_text(json.dumps(feed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(dry="--dry-run" in sys.argv)
