from fastapi.middleware.cors import CORSMiddleware
# Важно: импорт `spaces` должен идти самым первым для совместимости с бесплатным тарифом ZeroGPU!
try:
    import spaces
except Exception:
    spaces = None

import asyncio
import base64
import datetime as dt
import io
import json
import os
import random
import re
import subprocess
import tempfile
import logging
import threading
import time
import urllib.parse
import wave
from typing import Any, Dict, List, Optional, Tuple

import edge_tts
import httpx
from fastapi import APIRouter, FastAPI, Response
from fastapi.responses import StreamingResponse
from huggingface_hub import HfApi, InferenceClient
from pydantic import BaseModel

try:
    import gradio as gr
except Exception:
    gr = None

router = APIRouter()
_insights_lock = asyncio.Lock()

INSIGHTS_TARGET_REPO = os.getenv("ALIYA_CORE_REPO", "sharipovip/aliya-core").strip()
INSIGHTS_TARGET_BRANCH = os.getenv("ALIYA_CORE_BRANCH", "main").strip()
PRIMARY_ALIYA_HF_MODEL = os.getenv("ALIYA_HF_MODEL_REPO", "sharipovip/aliya-7b").strip()
ZEROGPU_TEACHER_TAJIK_MODEL = os.getenv("ALIYA_ZEROGPU_TAJIK_TEACHER", "unsloth/gemma-3-27b-it-bnb-4bit").strip()
ZEROGPU_TEACHER_LOGIC_MODEL = os.getenv("ALIYA_ZEROGPU_LOGIC_TEACHER", "unsloth/Qwen3-14B-bnb-4bit").strip()
REASONING_LAYER1_MODEL = os.getenv("ALIYA_REASONING_MODEL", "Qwen/Qwen3-8B").strip()
FALLBACK_ZEROGPU_CHAT_MODEL = REASONING_LAYER1_MODEL
ZEROGPU_VISION_MODEL = "Qwen/Qwen2.5-VL-3B-Instruct"
ZEROGPU_MMS_MODEL = "facebook/mms-1b-all"
ZEROGPU_WHISPER_MODEL = "openai/whisper-large-v3-turbo"
ZEROGPU_IMAGE_MODEL = "SG161222/RealVisXL_V5.0_Lightning"
ZEROGPU_TRANSLATION_MODEL = "facebook/nllb-200-distilled-600M"

_cuda_lock = threading.Lock()
_mms_init_lock = threading.Lock()
_teacher_distill_lock = threading.Lock()
_teacher_lessons_buffer: List[Dict[str, Any]] = []
_last_teacher_flush_ts: float = 0.0
_zerogpu_reasoning_cache: Dict[str, Any] = {"model_id": None, "tokenizer": None, "model": None}
_zerogpu_chat_cache: Dict[str, Any] = {"model_id": None, "tokenizer": None, "model": None, "checked_at": 0.0, "aliya_ready": False}
_zerogpu_vision_cache: Dict[str, Any] = {"processor": None, "model": None}
_zerogpu_mms_cache: Dict[str, Any] = {"processor": None, "model": None}
_zerogpu_whisper_cache: Dict[str, Any] = {"processor": None, "model": None}
_zerogpu_image_cache: Dict[str, Any] = {"pipe": None}
_translator_cache: Dict[str, Any] = {"tokenizer": None, "model": None}

_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+")
_TURN_LEAK_RE = re.compile(
    r"(?:<\|im_end\|>|<\|im_start\|>|<\|endoftext\|>|"
    r"(?:^|\n)\s*(?:user|assistant|system)\s*[:\n]|"
    r"sist[eê]ncia(?:user|assistant)|"
    r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]\s*(?:user|assistant))",
    flags=re.IGNORECASE,
)
_DOT_SPAM_RE = re.compile(r"(?:[.\u2026]\s*){6,}")


def _available_ram_gb() -> float:
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as mf:
            for line in mf:
                if line.startswith("MemAvailable:"):
                    kb = int(line.split()[1])
                    return kb / (1024.0 * 1024.0)
    except Exception:
        pass
    return 32.0


def _is_aliya_custom_model_ready(hf_token: str) -> bool:
    """Проверяет наличие обученной модели `sharipovip/aliya-7b` на Hugging Face (с кэшем 5 мин)."""
    now = time.time()
    if now - float(_zerogpu_chat_cache.get("checked_at", 0.0)) < 300.0 and _zerogpu_chat_cache.get("checked_at", 0.0) > 0:
        return bool(_zerogpu_chat_cache.get("aliya_ready"))
    ready = False
    if hf_token:
        try:
            info = HfApi(token=hf_token).model_info(PRIMARY_ALIYA_HF_MODEL, token=hf_token)
            ready = any(s.rfilename.endswith(".safetensors") for s in (info.siblings or []))
        except Exception:
            ready = False
    _zerogpu_chat_cache["checked_at"] = now
    _zerogpu_chat_cache["aliya_ready"] = ready
    return ready


def _resolve_active_zerogpu_chat_model(hf_token: str) -> str:
    return PRIMARY_ALIYA_HF_MODEL if _is_aliya_custom_model_ready(hf_token) else REASONING_LAYER1_MODEL


_CHAT_TJ_WORDS = {
    "салом", "ассалом", "раҳмат", "рахмат", "ташаккур", "ман", "ту", "шумо", "мо", "онҳо", "онхо",
    "барои", "дар", "бо", "аз", "ва", "ки", "ин", "он", "ҳаст", "хаст", "нест", "аст", "буд",
    "мебошад", "мешавад", "мекунад", "мекунам", "мехоҳам", "мехохам", "метавонам",
    "пойтахт", "пойтахти", "кишвар", "кишварҳо", "кишвархо", "ҳамсарҳад", "хамсархад",
    "президенташ", "кист", "чист", "куҷо", "кучо", "кадом", "чаро", "чанд", "чӣ", "чи", "кӣ",
    "тоҷикистон", "точикистон", "тоҷикӣ", "точики", "душанбе", "хуҷанд", "хучанд",
    "шаҳр", "шахр", "вилоят", "сомонӣ", "сомони", "забон", "забони", "китоб", "мактаб",
    "расм", "расми", "сурат", "сурати", "бисоз", "бикаш", "навис", "бигӯ", "бигу", "фаҳмон", "фахмон",
}
_CHAT_RU_WORDS = {
    "привет", "здравствуйте", "спасибо", "пожалуйста", "кто", "что", "где", "когда", "почему",
    "зачем", "как", "какой", "какая", "какие", "сколько", "сейчас", "сегодня", "было", "будет",
    "является", "президент", "таджикистана", "таджикистан", "напиши", "расскажи", "объясни",
    "переведи", "скажи", "создай", "сделай", "подготовь", "подготов", "покажи", "писал", "языке",
    "таджикском", "русском", "английском", "это", "мне", "тебе", "только", "просто", "очень",
}


_MATH_FORMULA_TOKENS = {
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
    "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
    "sin", "cos", "tan", "tg", "ctg", "cot", "sec", "csc",
    "arcsin", "arccos", "arctan", "arctg", "sinh", "cosh", "tanh",
    "log", "ln", "lg", "exp", "lim", "sqrt", "cbrt", "root",
    "mod", "abs", "max", "min", "gcd", "lcm", "pi", "dx", "dy", "dz", "dt",
}


def _detect_utterance_own_language(text: str, prior_messages: Optional[List[Dict[str, str]]] = None) -> str:
    """
    Определяет язык САМОЙ фразы пользователя (игнорируя целевые пометки вроде «на таджикском»),
    чтобы системные отказы и пояснения всегда звучали на языке, на котором обратился пользователь.
    """
    cleaned = re.sub(
        r"(?iu)\b(?:на\s+(?:таджикск|русск|английск|персидск)\w*|по[\-\s]?(?:таджикск|русск|английск)\w*|"
        r"бо\s+забони\s+\w+|ба\s+(?:то[ҷч]ик[ӣи]|рус[ӣи]|англис[ӣи])|in\s+(?:tajik|russian|english|persian))\b",
        " ",
        (text or ""),
    ).strip()
    probe = cleaned if cleaned else (text or "").strip()
    low = probe.lower().replace("ё", "е")
    if any("\u0600" <= ch <= "\u06FF" for ch in probe):
        return "tg"
    words = re.findall(r"[а-яӣқӯҳҷғa-z]+", low)
    ru_hits = sum(1.8 for w in words if w in _CHAT_RU_WORDS)
    for w in words:
        if len(w) >= 5 and w.endswith(("ого", "ому", "ыми", "ими", "ться", "тся", "ешь", "ете", "ает", "яет", "ите", "оди")):
            ru_hits += 1.4
    tj_hits = sum(2.0 for w in words if w in _CHAT_TJ_WORDS)
    diacritic_words = sum(1 for w in words if any(ch in "ӣқӯҳҷғ" for ch in w))
    if diacritic_words >= 1 and not (diacritic_words == 1 and ru_hits >= 2.5 and tj_hits <= 2.5):
        return "tg"
    if tj_hits >= 2.0 and tj_hits > ru_hits:
        return "tg"
    if ru_hits > 0 or any("а" <= ch <= "я" for ch in low):
        return "ru"
    if any("a" <= ch <= "z" for ch in low):
        if words and all(re.sub(r"\d+", "", w) in _MATH_FORMULA_TOKENS for w in words):
            for pm in reversed(prior_messages or []):
                p_txt = str(pm.get("content") or "")
                if any(ch in "ӣқӯҳҷғӢҚӮҲҶҒ" for ch in p_txt):
                    return "tg"
                if any("а" <= ch.lower() <= "я" for ch in p_txt):
                    return "ru"
            return "ru"
        return "en"
    return "ru"


def _infer_context_lang(prior_messages: List[Dict[str, str]]) -> str:
    """Наследует язык диалога для формул и коротких нейтральных реплик (например `x2 - 16 = 0`)."""
    for m in reversed(prior_messages):
        role = m.get("role", "")
        txt = str(m.get("content") or "").strip()
        if not txt:
            continue
        if role == "system":
            if "Ту Алия" in txt or "забони тоҷик" in txt:
                return "tg"
            if "Ты Алия" in txt or "на русском" in txt or "Кириллиц" in txt:
                return "ru"
            if "You are Aliya" in txt:
                return "en"
            continue
        low_m = txt.lower().replace("ё", "е")
        if any(ch in "ӣқӯҳҷғӢҚӮҲҶҒ" for ch in txt):
            return "tg"
        m_words = re.findall(r"[а-яa-z]+", low_m)
        if any("а" <= ch <= "я" for ch in low_m):
            tj_sc = sum(2.0 for w in m_words if w in _CHAT_TJ_WORDS)
            ru_sc = sum(1.8 for w in m_words if w in _CHAT_RU_WORDS)
            return "tg" if (tj_sc >= 2.0 and tj_sc > ru_sc) else "ru"
        if any("a" <= ch <= "z" for ch in low_m) and not all(re.sub(r"\d+", "", w) in _MATH_FORMULA_TOKENS for w in m_words):
            return "en"
    return "ru"


def _resolve_effective_chat_lang(messages: List[Dict[str, str]]) -> Tuple[str, bool]:
    """
    Определяет реальный язык ответа строго по смыслу сообщения пользователя (НЕ по языку кнопок UI!):
      1) Если пользователь явно попросил ответить на конкретный язык («напиши на таджикском»,
         «бо забони русӣ», «in English») — возвращает запрошенный язык и флаг explicit=True.
         Исключение: запрос перевода отдельного слова («переведи слово ... на таджикский») объясняется
         на языке самого вопроса с приведением точного перевода.
      2) Для математических уравнений (`x2 - 16 = 0`) наследует язык текущего диалога.
      3) Иначе определяет язык самой реплики пользователя (tg / ru / en / fa), не сбиваясь от одного
         заимствованного слова с диакритикой (например, «курс доллара на сомонӣ»).
    """
    last_user = ""
    last_idx = len(messages) - 1
    for idx in range(len(messages) - 1, -1, -1):
        m = messages[idx]
        if m.get("role") == "user" and (m.get("content") or "").strip():
            last_user = str(m.get("content")).strip()
            last_idx = idx
            break
    low = last_user.lower().replace("ё", "е")
    prior = messages[:last_idx]
    if not low:
        return _infer_context_lang(prior), False

    is_word_translation = bool(
        re.search(r"^\s*(?:перев[ео]д\w*|как\s+будет\b|тарҷума\b|тарчума\b|translate\b)", low)
        and not re.search(r"тар[ҷч]умаи\s+[ҳх]ол", low)
    )

    # 1. Явная просьба ответить на выбранный язык / письменность (кроме короткого «переведи слово X на ...»)
    if re.search(
        r"(хати\s+ни[её]гон|хати\s+форс[ӣи]|ҳуруфи\s+араб[ӣи]|бо\s+хати\s+араб[ӣи]|"
        r"арабск(?:ой\s+вязью|им\s+письмом|ой\s+график)|arabic\s+script|persian\s+script)",
        low,
    ):
        return "fa", True
    if not is_word_translation:
        if re.search(r"(на\s+таджикск|по[\-\s]?таджикск|бо\s+забони\s+то[ҷч]ик|ба\s+то[ҷч]ик[ӣи]|in\s+tajik)", low):
            return "tg", True
        if re.search(r"(на\s+русск|по[\-\s]?русск|бо\s+забони\s+рус|ба\s+рус[ӣи]|in\s+russian)", low):
            return "ru", True
        if re.search(r"(на\s+английск|по[\-\s]?английск|бо\s+забони\s+англис|in\s+english)", low):
            return "en", True

    # 2. Персидская вязь (от голосового распознавателя `fa-IR`): понимаем как таджикскую речь и отвечаем таджикской кириллицей (`tg`),
    # кроме случаев, когда пользователь явно попросил `хати ниёгон / хати форсӣ` выше!
    if any("\u0600" <= ch <= "\u06FF" for ch in last_user):
        return "tg", False

    has_cyr = any("а" <= ch <= "я" or ch in "ӣқӯҳҷғ" for ch in low)
    has_lat = any("a" <= ch <= "z" for ch in low)
    words = re.findall(r"[а-яӣқӯҳҷғa-z]+", low)

    if not has_cyr and has_lat:
        # Защита для уравнений и формул: `x2 - 16 = 0`, `2x + 3y = 12`, `sin(x) = 0.5`
        alpha_tokens = [re.sub(r"\d+", "", w) for w in re.findall(r"[a-z0-9]+", low) if any("a" <= c <= "z" for c in w)]
        has_math_ops = bool(re.search(r"[=+\-*/^<>√²³]|\d", low))
        if alpha_tokens and has_math_ops and all(tok in _MATH_FORMULA_TOKENS for tok in alpha_tokens):
            return _infer_context_lang(prior), False

        tj_lat = {"salom", "salam", "chi", "khel", "shumo", "rahmat", "tojikiston", "dushanbe", "khujand", "kujo", "chist", "kist"}
        if sum(1 for w in words if w in tj_lat) >= 2:
            return "tg", False
        return "en", False

    if not has_cyr and not has_lat:
        return _infer_context_lang(prior), False

    tj_hits = sum(2.0 for w in words if w in _CHAT_TJ_WORDS)
    for w in words:
        if len(w) >= 5 and w.endswith(("хо", "ро", "аш", "ам", "ат", "ем", "ед", "анд")):
            tj_hits += 1.2
        if len(w) >= 6 and w.startswith(("ме", "наме", "би")):
            tj_hits += 0.8
    ru_hits = sum(1.8 for w in words if w in _CHAT_RU_WORDS)
    for w in words:
        if len(w) >= 5 and w.endswith(("ого", "ому", "ыми", "ими", "ться", "тся", "ешь", "ете", "ает", "яет", "ите", "оди")):
            ru_hits += 1.4

    # 3. Таджикская диакритика: учитываем одиночные названия валют/городов внутри русской фразы («курс доллара на сомонӣ»)
    diacritic_words = [w for w in words if any(ch in "ӣқӯҳҷғ" for ch in w)]
    if diacritic_words:
        if len(diacritic_words) == 1 and ru_hits >= 2.8 and tj_hits <= 2.5:
            return "ru", False
        return "tg", False

    if tj_hits >= 2.0 and tj_hits > ru_hits:
        return "tg", False
    if ru_hits > 0:
        return "ru", False

    return _infer_context_lang(prior), False


def _build_verified_tj_facts(messages: List[Dict[str, str]], target_lang: str) -> str:
    """
    Достоверная эталонная справка по ключевым фактам о Таджикистане, истории и личностях:
    исключает выдумывание дат, чужих источников, ложных границ и смешение языков.
    Биографические справки о личностях подставляются СТРОГО по последнему вопросу пользователя
    (и с проверкой границ слова, чтобы выражение «айни замон» не вызывало биографию Садриддина Айни!).
    """
    user_history_text = " ".join(
        str(m.get("content") or "").strip().lower().replace("ё", "е")
        for m in messages[-6:]
        if m.get("role") == "user" and (m.get("content") or "").strip()
    )
    if not user_history_text:
        return ""

    # Вырезаем устойчивые наречия времени («айни замон», «айни ҳол», «дар айни»), чтобы они не триггерили Садриддина Айни
    person_probe = re.sub(
        r"\b(?:дар\s+)?айни\s+(?:замон\w*|ҳол\w*|хол\w*|вақт\w*|вакт\w*|дам\w*|муддат\w*)\b",
        " ",
        user_history_text,
    )

    wants_somoni_bio = bool(re.search(r"\b(?:исмоил\w*\s+сомон\w*|сомониён\w*|саманид\w*|samanid\w*|ismail\s+samani)\b", person_probe))
    wants_rudaki = bool(re.search(r"\b(?:аб[уӯ]абдулл?о\w*|рудак[иӣ]\w*|рӯдак[ӣи]\w*|rudaki|панҷрӯд|панджруд)\b", person_probe))
    wants_sino = bool(re.search(r"\b(?:ибни?\s+сино|абуал[ӣи]\w*|авицен\w*|avicenna|ibn\s+sina)\b", person_probe))
    wants_ayni = bool(re.search(r"\b(?:садриддин\w*|устод\s+айн[ӣи]|айнӣ|айни|ayni|aini)\b", person_probe))
    wants_gafurov = bool(re.search(r"\b(?:гафуров\w*|ғафуров\w*|gafurov|бобоҷон\w*|бободжан\w*)\b", person_probe))
    wants_khujand = bool(re.search(r"\b(?:худжанд\w*|хуҷанд\w*|хучанд\w*|khujand)\b", person_probe))
    wants_emblem = bool(re.search(r"\b(?:герб\w*|нишони\s+давлат\w*)\b", person_probe))

    general_tj_triggers = (
        "таджикистан", "тоҷикистон", "точикистон", "tajikistan",
        "пойтахти тоҷикистон", "столица таджикистана", "президенти тоҷикистон", "президент таджикистана",
        "душанбе", "рогун", "роғун", "памир", "помир",
    )
    has_general_tj = any(t in user_history_text for t in general_tj_triggers)
    if not (has_general_tj or wants_somoni_bio or wants_rudaki or wants_sino or wants_ayni or wants_gafurov or wants_khujand or wants_emblem):
        return ""

    extra_tg: List[str] = []
    extra_ru: List[str] = []
    extra_en: List[str] = []

    if wants_somoni_bio:
        extra_tg.append(
            "Исмоили Сомонӣ (849–907) — амир ва бунёдгузори иқтидори давлати мутамаркази Сомониён (пойтахташ Бухоро), "
            "ки дар рушди давлатдорӣ, илм ва забону адабиёти тоҷику форс нақши бузург гузоштааст; пули миллии Тоҷикистон — сомонӣ — ба шарафи ӯ номгузорӣ шудааст."
        )
        extra_ru.append(
            "Исмоил Сомони (849–907) — выдающийся правитель и укрепитель централизованного государства Саманидов (столица — Бухара), "
            "сыгравший ключевую роль в расцвете государственности, науки и таджикско-персидской культуры; в его честь названа валюта Таджикистана — сомони."
        )
        extra_en.append(
            "Ismail Samani (849–907) consolidated the centralized Samanid state (capital Bukhara), fostering science and Tajik-Persian culture; Tajikistan's currency, the somoni, is named after him."
        )

    if wants_rudaki:
        extra_tg.append(
            "Абуабдуллоҳи Рӯдакӣ (тақрибан соли 858, деҳаи Панҷрӯди Панҷакент — соли 941, ҳамон ҷо) — сардафтари адабиёти классикии тоҷику форс («Одамушшуаро»). "
            "Эзоҳи муҳим: соли дақиқи таваллуди ӯ дар сарчашмаҳои қадим сабт нашудааст ва дар илми таърих тақрибан соли 858 (баъзан ҳудуди 858–860) нишон дода мешавад — соли 866 ё сарчашмаву китобҳои бофтаро ҳаргиз набоф."
        )
        extra_ru.append(
            "Абуабдулло Рудаки (ок. 858, селение Панджруд близ Пенджикента — 941, там же) — родоначальник таджикско-персидской классической поэзии («Адам поэтов»). "
            "Важно: точный год его рождения в средневековых хрониках не зафиксирован и в науке указывается приблизительно — около 858 года (иногда ок. 858–860 гг.); не приписывай 866 год как точный факт и не выдумывай несуществующие книги или ссылки."
        )
        extra_en.append(
            "Abu Abdulloh Rudaki (born c. 858 in Panjrud near Panjakent — died 941) is the founder of classical Tajik-Persian poetry; his birth year (~858) is an approximate scholarly estimate, so never state fabricated exact years like 866 or invented citations."
        )

    if wants_sino:
        extra_tg.append(
            "Абуалӣ ибни Сино (Абуалӣ Ҳусайн ибни Абдуллоҳ ибни Сино, машҳур ба Авиценна; соли 980, деҳаи Афшона дар наздикии Бухоро, давлати Сомониён — соли 1037, шаҳри Ҳамадон) — "
            "олими бузурги энсиклопедист, табиб, файласуф, риёзидон ва шоири тоҷику форс («Шайхурраис»). "
            "Асарҳои машҳуртаринаш: «Ал-Қонун фи-т-тиб» («Қонуни тиб» дар 5 китоб, ки садсолаҳо китоби асосии пизишкии Шарқу Аврупо буд), «Китоб аш-шифо» ва «Донишнома» (бо забони тоҷикӣ-форсӣ). "
            "Эзоҳ: ҳаргиз ҷои таваллуди ӯро «Ҳуҷар» ё Афғонистон нагӯ — ӯ дар Афшонаи Бухоро таваллуд шудааст."
        )
        extra_ru.append(
            "Абуали ибн Сино (Авиценна; 980, селение Афшана близ Бухары, государство Саманидов — 1037, Хамадан) — великий таджикско-персидский учёный-энциклопедист, врач, философ, математик и поэт («Шейх ар-Раис»). "
            "Главные труды: «Канон врачебной науки» («Ал-Канун фи-т-тибб» в 5 книгах), «Книга исцеления» («Китаб аш-шифа») и философский труд «Донишнома» на таджикско-персидском языке."
        )
        extra_en.append(
            "Abu Ali ibn Sina (Avicenna; 980, Afshana near Bukhara in the Samanid Empire — 1037, Hamadan) was a renowned Tajik-Persian polymath, physician, philosopher, and poet, author of The Canon of Medicine (Al-Qanun fi al-Tibb), The Book of Healing, and Danishnama."
        )

    if wants_ayni:
        extra_tg.append(
            "Садриддин Айнӣ (15 апрели 1878, деҳаи Соктареи Ғиждувон — 15 июли 1954, Душанбе) — асосгузори адабиёти муосири тоҷик, нахустин Президенти Академияи илмҳои Тоҷикистон ва Қаҳрамони Тоҷикистон; муаллифи «Ёддоштҳо», «Дохунда», «Ғуломон» ва «Марги судхӯр»."
        )
        extra_ru.append(
            "Садриддин Айни (1878, кишлак Соктаре близ Гиждувана — 1954, Душанбе) — основоположник современной таджикской литературы, первый президент Академии наук Таджикистана, Герой Таджикистана; автор «Воспоминаний» («Ёддоштҳо»), «Дохунда», «Рабы» и «Смерть ростовщика»."
        )
        extra_en.append(
            "Sadriddin Ayni (1878–1954) is the founder of modern Tajik literature, first President of the Academy of Sciences of Tajikistan, and Hero of Tajikistan."
        )

    if wants_gafurov:
        extra_tg.append(
            "Бобоҷон Ғафуров (31 декабри 1908, Исфисор, ноҳияи Хуҷанд — 12 июли 1977, Душанбе) — муаррихи барҷаста, академик, арбоби давлатӣ, Қаҳрамони Тоҷикистон ва муаллифи шоҳасари таърихии «Тоҷикон»."
        )
        extra_ru.append(
            "Бободжан Гафуров (1908, Исфисар близ Худжанда — 1977, Душанбе) — выдающийся историк-востоковед, академик, государственный деятель, Герой Таджикистана, автор фундаментального труда «Таджики» («Тоҷикон»)."
        )
        extra_en.append(
            "Bobojon Gafurov (1908–1977, born near Khujand) was a prominent historian, statesman, Hero of Tajikistan, and author of the landmark historical work The Tajiks."
        )

    if wants_khujand:
        extra_tg.append(
            "Хуҷанд — маркази маъмурии вилояти Суғд дар шимоли Тоҷикистон дар соҳили дарёи Сир, яке аз қадимтарин шаҳрҳои Осиёи Марказӣ (зиёда аз 2500 сол)."
        )
        extra_ru.append(
            "Худжанд — административный центр Согдийской области на севере Таджикистана на берегах Сырдарьи, один из древнейших городов Центральной Азии (история более 2500 лет)."
        )
        extra_en.append(
            "Khujand is the administrative center of Sughd Region in northern Tajikistan on the Syr Darya river, one of Central Asia's oldest cities (over 2,500 years old)."
        )

    if wants_emblem:
        extra_tg.append(
            "Нишони давлатии Ҷумҳурии Тоҷикистон: тоҷи заррин ва нимдоираи ҳафт ситора дар шуоъҳои офтоби аз паси кӯҳҳои барфпӯши Помир тулӯъкунанда, аз рост хӯшаҳои гандум ва аз чап шохаҳои пахта бо ғӯзаҳои кушода бо тасмаи серанга печонида шуда, дар поён китоби боз рӯи курсӣ."
        )
        extra_ru.append(
            "Государственный герб Республики Таджикистан представляет собой стилизованную золотую корону и полукруг из семи звёзд на ней в лучах солнца, восходящего из-за покрытых снегом гор Памира, обрамлённые справа колосьями пшеницы, слева ветвями хлопчатника с раскрытыми коробочками, перевитыми красно-бело-зелёной лентой; в нижней части помещена раскрытая книга на подставке."
        )
        extra_en.append(
            "The State Emblem of the Republic of Tajikistan depicts a stylized golden crown with a semicircle of seven stars in the rays of the sun rising behind snow-capped Pamir mountains, framed by wheat ears on the right and cotton branches on the left wrapped in the red-white-green ribbon, with an open book on a stand below."
        )

    if target_lang == "tg":
        base_tg = (
            "\nМаълумоти расмии дақиқ (танҳо дар ҷои мувофиқ ба савол истифода бар, зиндагиномаи шахсони бегонаро бе пурсиш илова накун): "
            "Ҷумҳурии Тоҷикистон 9 сентябри соли 1991 истиқлолият ба даст овард. "
            "Пойтахти Тоҷикистон — шаҳри Душанбе. "
            "Президенти Ҷумҳурии Тоҷикистон — Эмомалӣ Раҳмон (аз соли 1994 Президент, аз ноябри 1992 Сарвари давлат). "
            "Тоҷикистон танҳо бо 4 кишвар ҳамсарҳад аст: дар ғарб ва шимол бо Ӯзбекистон ва Қирғизистон, "
            "дар шарқ бо Чин (Хитой), дар ҷануб бо Афғонистон (бо Ҳиндустон ё Арманистон ҳамсарҳад НЕСТ). "
            "Воҳиди пулии миллӣ — сомонӣ (TJS). Забони давлатӣ — забони тоҷикӣ."
        )
        return base_tg + (" " + " ".join(extra_tg) if extra_tg else "")
    if target_lang == "en":
        base_en = (
            "\nVerified official facts (use only what is relevant to the question; do not append unrelated biographies): "
            "The capital of the Republic of Tajikistan is Dushanbe. "
            "The President of Tajikistan is Emomali Rahmon. "
            "Tajikistan borders exactly 4 countries: Uzbekistan, Kyrgyzstan, China, and Afghanistan. "
            "Independence Day: September 9, 1991. National currency: Tajikistani somoni (TJS)."
        )
        return base_en + (" " + " ".join(extra_en) if extra_en else "")
    base_ru = (
        "\nТочные официальные факты (используй только относящиеся к вопросу; не приписывай в конце посторонние биографии без запроса): "
        "Столица Республики Таджикистан — город Душанбе. "
        "Действующий Президент Республики Таджикистан — Эмомали Рахмон. "
        "Таджикистан граничит ровно с 4 государствами: Узбекистаном, Кыргызстаном, Китаем и Афганистаном. "
        "День независимости — 9 сентября 1991 года. Национальная валюта — сомони (TJS)."
    )
    return base_ru + (" " + " ".join(extra_ru) if extra_ru else "")


_THIRD_PARTY_BRAND_RE = re.compile(
    r"\b(?:Google\s+DeepMind|DeepMind|Gemini(?:\s*[\d.]+)?|Gemma(?:[-\s]*\d+)?|Qwen(?:\s*[\d.]+)?|"
    r"Alibaba(?:\s+Cloud)?|Tongyi|OpenAI|ChatGPT|GPT-(?:OSS|\d\w*)|Meta\s+AI|Llama(?:[-\s]*\d+)?|"
    r"DeepSeek(?:[-\s]*V?\d+)?|Mistral|Anthropic|Claude|Cohere|Command\s+A|SambaNova|Nemotron|"
    r"Groq|Cerebras|MiniMax|YandexGPT|Яндекс\s*GPT)\b",
    flags=re.IGNORECASE,
)

_CODE_FENCE_SPLIT_RE = re.compile(r"(```[\s\S]*?(?:```|$))")

# Чисто узбекские корни, галлюцинированные конструкции («туғил.», «мегунад») и смешение алфавитов внутри слова.
_UZBEK_CONTAMINATION_RE = re.compile(
    r"(?iu)(?:ў|\b(?:учун|билан|бўлади|бўлган|бўлиб|қилиш|қилинади|эмас|шунингдек|ҳамда|ҳақида|орқали|тўғрисида|"
    r"туғил\w*|тугил\w*|мегунад|таҷаллус\w*|ӯлч\w*|ўлч\w*|олчов\w*|улчов\w*|взвешидан\w*|нестодаме\w*)\b)"
)
_MIXED_SCRIPT_CORRUPT_WORD_RE = re.compile(
    r"(?=[А-Яа-яЁёӢӣҚқӮӯҲҳҶҷҒғA-Za-z\u0600-\u06FF]*[А-Яа-яЁёӢӣҚқӮӯҲҳҶҷҒғ])"
    r"(?=[А-Яа-яЁёӢӣҚқӮӯҲҳҶҷҒғA-Za-z\u0600-\u06FF]*(?:[A-Za-z]|[\u0600-\u06FF]))"
    r"[А-Яа-яЁёӢӣҚқӮӯҲҳҶҷҒғA-Za-z\u0600-\u06FF]{4,}"
)


def _has_uzbek_contamination(text: str) -> bool:
    """Обнаруживает узбекское смешение и испорченные гибридные слова с латиницей/арабицей внутри кириллицы."""
    if not text:
        return False
    parts = _CODE_FENCE_SPLIT_RE.split(text)
    prose = " ".join(p for p in parts if not p.lstrip().startswith("```"))
    if _UZBEK_CONTAMINATION_RE.search(prose):
        return True
    if _MIXED_SCRIPT_CORRUPT_WORD_RE.search(prose):
        return True
    return False


# ==============================================================================
# ЖЁСТКИЙ ПРЕД-ИИ ФИЛЬТР БЕЗОПАСНОСТИ 18+ / НАГОТЫ / CSAM С АНТИ-ОБХОДОМ (RU / TG / EN / FA / UZ)
# ==============================================================================
_LEET_CYR_MAP = str.maketrans({
    "@": "а", "4": "ч", "0": "о", "3": "з", "1": "и", "6": "б", "$": "с",
    "a": "а", "e": "е", "o": "о", "p": "р", "c": "с", "x": "х", "y": "у", "k": "к", "m": "м", "t": "т", "b": "в",
    "ё": "е",
})
_LEET_LAT_MAP = str.maketrans({
    "@": "a", "4": "a", "0": "o", "3": "e", "1": "i", "$": "s", "5": "s",
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "к": "k", "і": "i",
})
_MASK_CHARS_RE = re.compile(r"[*#•×_~^`´'\"?]+")

_NSFW_EXPLICIT_CYR_PATTERNS = [
    r"\bсе.{0,2}кс\w*",
    r"\bп.{0,2}зд\w*",
    r"\bх[уy*].{0,1}[йеяюи]\w*",
    r"\b[еe]б[аоуыи]\w*",
    r"\bбл[яa]д\w*",
    r"\bмин[еи]т\w*",
    r"\bоргазм\w*",
    r"\bпорн\w*",
    r"\bэрот\w*",
    r"\bсис.{0,2}к\w*",
    r"\bтит.{0,2}к\w*",
    r"\bдойк\w*",
    r"\bгол(?:ый|ая|ые|ую|ой|ое|еньк\w*|иш\w*)\b",
    r"\bобнаж\w*",
    r"\bраздет\w*",
    r"\bбез\s+(?:одежд\w*|бель\w*|лифчик\w*|трус\w*|купальник\w*)",
    r"\bтоплес\w*",
    r"\bинтимн\w*\s+(?:фото\w*|картин\w*|девуш\w*|женщ\w*|тел\w*|част\w*)",
    r"\bвагин\w*",
    r"\bпенис\w*",
    r"\bчлен\s+(?:мужск\w*|полов\w*)",
    r"\bсосок\b|\bсоски\b",
    r"\bгенитал\w*",
    r"\bпроститут\w*",
    r"\bшлюх\w*",
    # Таджикский (кириллица, с диакритикой и без, в т.ч. маскировка звёздочками)
    r"\bбе\s*либос\w*",
    r"\bбара[ҳх]на\w*",
    r"\bур[ёе]н\w*",
    r"\bша[ҳх]вон\w*",
    r"\bша[ҳх]ват\w*",
    r"\bфа[ҳх]ш\w*",
    r"\bфо[ҳх]иша\w*",
    r"\bҷимоъ\w*|\bчимоъ\w*",
    r"\bаврат\w*",
    r"\bсина(?:ҳо|хо|аш|ҳояш|хояш)?\s*(?:луч|лич|кушод|намо[ёе]н|калон)",
    r"\b(?:луч|лич)\s*(?:кард\w*|шуд\w*|бош\w*|намо\w*)",
    r"\b(?:духтар|зан|ҷисм|тан|сина)\w*\s+(?:луч|лич|л.ч)\b",
    r"\b(?:луч|лич)\s+(?:духтар|зан|бадан)\w*",
    r"\bсина.{0,3}\s+л.{0,1}ч\w*",
    r"\bкус(?:и|аш|ро)?\b",
    r"\bк[еи]р(?:и|аш|ро)?\b\s+(?:калон|мардона|луч)",
    # Узбекский кириллицей
    r"\bялан[ғг]оч\w*",
]

_NSFW_EXPLICIT_LAT_PATTERNS = [
    r"\bs.{0,2}x(?:y|ual)?\b",
    r"\bp.{0,2}rn\w*",
    r"\bn.{0,1}d(?:e|es|ity)\b",
    r"\bnak.{0,1}d\b",
    r"\bb.{1,2}bs\b",
    r"\bbr.{1,2}sts?\b",
    r"\btits\b|\btitties\b|\btopless\b|\bnipples?\b",
    r"\bp.{1,2}ssy\b|\bvagina\b|\bpenis\b|\bdick\b|\bcock\b|\bf.{1,2}ck\w*\b|\bhentai\b|\bnsfw\b|\berotic\w*\b|\bxxx\b",
    r"\bbe\s*libos\b|\bbarahna\b|\bduxtari\s+l[ui]ch\b|\bsinaho\w*\s+l[ui]ch\b|\byalang['`ʻ]?och\b",
]

_NSFW_PERSIAN_PATTERNS = [
    r"لخت", r"برهنه", r"عریان", r"سکس", r"پورن", r"شهوت", r"شهوانی", r"سینه\s*لخت", r"بی\s*لباس", r"فاحشه",
]

_MINOR_AGE_RE = re.compile(
    r"(?iu)(?:"
    r"\b(?:[1-9]|1[0-7])\s*(?:-\s*)?(?:лет\w*|год\w*|сола\w*|y\.?o\.?\b|years?\s*old|yr\w*\b)|"
    r"\b(?:одиннадцат|двенадцат|тринадцат|четырнадцат|пятнадцат|шестнадцат|семнадцат)\w*\s*лет\w*|"
    r"\b(?:ёздаҳ|дувоздаҳ|сенздаҳ|чордаҳ|понздаҳ|шонздаҳ|ҳабдаҳ|хабдах|понздах|чордах|сенздах)\s*сола|"
    r"\b(?:несовершеннолетн\w*|малолетн\w*|школьниц\w*|подрост\w*|ноболи[ғг]\w*|духтарча\w*|кӯдак\w*|кудак\w*|"
    r"underage|minor|child|preteen|loli|lolita|shota)\b"
    r")"
)
_MINOR_BODY_CONTEXT_RE = re.compile(
    r"(?iu)(?:гол\w*|обнаж\w*|раздет\w*|сис\w*|груд\w*|трус\w*|бель\w*|бикин\w*|купальник\w*|эроти\w*|интим\w*|секс\w*|"
    r"лич|луч|бе\s*либос|бара[ҳх]на|сина\w*|ша[ҳх]вон\w*|"
    r"nude|naked|topless|sexy|bikini|lingerie|underwear|breast|boob|erotic|nsfw)"
)


def _collapse_spaced_letters(s: str) -> str:
    """Схлопывает разрядку вида `с.е.к.с`, `п - и - з - д - а`, `s e x` в слитные слова."""
    return re.sub(
        r"(?<!\w)([А-Яа-яЁёӢӣҚқӮӯҲҳҶҷҒғA-Za-z])(?:[\s.\-_+/\\|]{1,2}([А-Яа-яЁёӢӣҚқӮӯҲҳҶҷҒғA-Za-z])){2,}(?!\w)",
        lambda m: re.sub(r"[\s.\-_+/\\|]+", "", m.group(0)),
        s,
    )


def safety_refusal_message(lang: str) -> str:
    if lang == "tg":
        return "Бубахшед, Алия тасвирҳо ва маводи дорои мазмуни шаҳвонӣ, бараҳна ё +18-ро намесозад ва коркард намекунад."
    if lang == "en":
        return "Sorry, Aliya does not generate or process sexually explicit, nude, or 18+ content."
    return "Извините, Алия не создаёт и не обрабатывает откровенные, интимные изображения и материалы 18+."


_CANONICAL_BANNED_WORDS = (
    # Русский
    "секс", "секса", "сексуальная", "сексуальный", "порно", "порнуха", "эротика", "эротический",
    "пизда", "пиздец", "пизду", "хуй", "хуя", "ебать", "ебля", "блядь", "минет", "оргазм",
    "сиськи", "сиська", "сисек", "титьки", "дойки", "голая", "голый", "голые", "голую",
    "обнаженная", "обнаженный", "раздетая", "топлес", "вагина", "пенис", "соски", "гениталии", "шлюха", "проститутка",
    # Таджикский
    "бараҳна", "барахна", "шаҳвонӣ", "шахвони", "шаҳват", "шахват", "фаҳш", "фахш", "фаҳшо",
    "фоҳиша", "фохиша", "ҷимоъ", "чимоъ", "синаҳояш", "синахояш", "белибос", "яланғоч", "ялангоч",
    # English
    "sex", "sexy", "sexual", "porn", "porno", "pornography", "nude", "nudes", "nudity", "naked",
    "boobs", "breasts", "tits", "titties", "topless", "nipples", "pussy", "vagina", "penis",
    "dick", "cock", "fuck", "fucking", "hentai", "erotic", "nsfw", "lingerie",
)


def _matches_wildcard_masked_banned_word(raw_text: str) -> bool:
    """
    Ловит любую маскировку звёздочками/решётками внутри запрещённых слов (`се**с`, `п*зд@`, `пи**а`,
    `с*ськ*`, `г*лая`, `b**bs`, `n*de`, `p*ssy`), где 1–3 буквы в любом месте слова заменены символами `*#•×_~?`.
    """
    tokens = re.findall(r"[А-Яа-яЁёӢӣҚқӮӯҲҳҶҷҒғA-Za-z0-9@$*#•×_~^?]{3,24}", raw_text.lower())
    for tok in tokens:
        if not _MASK_CHARS_RE.search(tok):
            continue
        real_letters = _MASK_CHARS_RE.sub("", tok)
        if len(real_letters) < 3:
            continue
        for cmap in (_LEET_CYR_MAP, _LEET_LAT_MAP):
            mapped = tok.translate(cmap)
            parts = [re.escape(p) for p in _MASK_CHARS_RE.split(mapped)]
            # Каждая группа звёздочек заменяет от 1 до 3 скрытых букв
            pat_str = "^" + r"[а-яӣқӯҳҷғa-z]{1,3}".join(parts) + "$"
            try:
                cre = re.compile(pat_str)
                if any(cre.match(bw) for bw in _CANONICAL_BANNED_WORDS):
                    return True
            except re.error:
                continue
    return False


def _check_nsfw_safety_strict(
    raw_text: str,
    prior_messages: Optional[List[Dict[str, str]]] = None,
    is_image_context: bool = False,
) -> Optional[Dict[str, str]]:
    """
    Мгновенная пред-ИИ проверка безопасности (< 0.2 мс, ДО обращения к любой нейросети):
      - Блокирует любые запросы с несовершеннолетними + телом/наготой (CSAM zero-tolerance).
      - Блокирует любые 18+ / обнажённые / порнографические запросы на RU / TG / EN / FA / UZ,
        включая маскировку звёздочками (`се**с`, `пи**а`), подмену символов (`пизд@`, `$ex`) и разрядку (`с.е.к.с`).
    Возвращает словарь с вежливым отказом на языке самого вопроса либо `None`, если текст чист.
    """
    text = (raw_text or "").strip()
    if not text:
        return None

    own_lang = _detect_utterance_own_language(text, prior_messages)
    collapsed = _collapse_spaced_letters(text.lower())
    if _matches_wildcard_masked_banned_word(collapsed):
        return {"blocked": "nsfw_masked", "lang": own_lang, "message": safety_refusal_message(own_lang)}

    wildcard_norm = _MASK_CHARS_RE.sub("х", collapsed)
    cyr_view = wildcard_norm.translate(_LEET_CYR_MAP)
    lat_view = wildcard_norm.translate(_LEET_LAT_MAP)

    # 1. Абсолютный запрет любого откровенного контекста с возрастом < 18 лет
    if _MINOR_AGE_RE.search(collapsed) and (_MINOR_BODY_CONTEXT_RE.search(collapsed) or _MINOR_BODY_CONTEXT_RE.search(cyr_view) or _MINOR_BODY_CONTEXT_RE.search(lat_view)):
        return {"blocked": "minor_safety", "lang": own_lang, "message": safety_refusal_message(own_lang)}

    # 2. Персидско-арабские маркеры 18+
    for pat in _NSFW_PERSIAN_PATTERNS:
        if re.search(pat, collapsed):
            return {"blocked": "nsfw", "lang": own_lang, "message": safety_refusal_message(own_lang)}

    # 3. Кириллические (RU / TG / UZ) и латинские (EN / TG-lat) маркеры 18+ с анти-обходом
    for pat in _NSFW_EXPLICIT_CYR_PATTERNS:
        if re.search(pat, collapsed, flags=re.IGNORECASE) or re.search(pat, cyr_view, flags=re.IGNORECASE):
            return {"blocked": "nsfw", "lang": own_lang, "message": safety_refusal_message(own_lang)}

    for pat in _NSFW_EXPLICIT_LAT_PATTERNS:
        if re.search(pat, collapsed, flags=re.IGNORECASE) or re.search(pat, lat_view, flags=re.IGNORECASE):
            return {"blocked": "nsfw", "lang": own_lang, "message": safety_refusal_message(own_lang)}

    # 4. Для режима генерации фото — дополнительные анатомические/полураздетые комбинации («красивая киска 18 лет», «синахои калон»)
    if is_image_context:
        img_extra_re = re.compile(
            r"(?iu)(?:\bкиск[аиу]\b|\bпопк[аиу]\b|\bзадниц\w*|\bягодиц\w*|\bэротич\w*|\bсоблазн\w*|"
            r"\bв\s+нижнем\s+бель\w*|\bв\s+трусик\w*|\bв\s+лифчик\w*|\bдекольте\b|"
            r"\bсина(?:ҳо|хо|ҳояш|хояш)\s+калон|\blingerie\b|\bcleavage\b|\bseductive\b|\bsensual\s+body\b)"
        )
        if img_extra_re.search(collapsed) or img_extra_re.search(cyr_view) or img_extra_re.search(lat_view):
            return {"blocked": "nsfw_image", "lang": own_lang, "message": safety_refusal_message(own_lang)}

    return None


# ==============================================================================
# v159: ТОЧНЫЙ ФИЛЬТР 18+ ДЛЯ ТЕКСТА (чат и задачи по книгам).
# Для генерации/плана фото (is_image_context=True) по-прежнему работает СТРОГИЙ фильтр
# _check_nsfw_safety_strict — без единого изменения.
# Причина: нечёткие шаблоны строгого фильтра (`х[у].{0,1}[йеяюи]`, `п.{0,2}зд`, `аврат`, «дети + гол/сис/бель/лич»)
# блокировали обычные слова: «худи», «худе», «понздаҳ», «поздравляю», «праздник», «поезд», «глагол», «система»,
# «мебель», «личность» — и Алия отвечала отказом 18+ на учебные тексты.
# Здесь — только точные слова с границами + та же защита от маскировки (`се**с`, `п*зд@`, `с.е.к.с`).
# ==============================================================================
_NSFW_TEXT_CYR_PATTERNS = [
    # Русский
    r"\bсекс\w*", r"\bпорн\w*", r"\bэроти\w*", r"\bпизд\w*",
    r"\bху[йяю]\w*", r"\bхуе[вмсл]\w*", r"\bхуё\w*",
    r"\b[её]б(?:ать|ал\w*|ан\w*|ля\w*|ут\w*|ёт\w*|ет\b|ись|ну\w*|ош\w*)",
    r"\bбля[дт]\w*", r"\bминет\w*", r"\bоргазм\w*",
    r"\bсиськ\w*", r"\bсисек\b", r"\bтитьк\w*",
    r"\bгол(?:ая|ые|ую|енькая|енькие|ышом)\b", r"\bголый\s+(?:мужчин\w*|парен\w*|человек\w*|тел\w*)",
    r"\bобнаж[её]нн(?:ая|ые|ую|ой)\b", r"\bраздет(?:ая|ые|ую)\b",
    r"\bбез\s+(?:одежды|белья|лифчика|трусов|купальника)\b",
    r"\bтоплес\w*", r"\bинтимн\w*\s+(?:фото\w*|картин\w*|видео\w*|част\w*)",
    r"\bвагин\w*", r"\bпенис\w*", r"\bгенитал\w*", r"\bпроститут\w*", r"\bшлюх\w*",
    # Таджикский
    r"\bбе\s*либос\w*", r"\bбара[ҳх]на\w*", r"\bур[ёе]н\b", r"\bша[ҳх]вон[ӣи]\w*",
    r"\bфо[ҳх]иша\w*", r"\bҷимоъ\w*|\bчимоъ\w*",
    r"\b(?:духтар|зан|ҷисм|чисм|тан|бадан|сина)\w*\s+(?:луч|лич)\b", r"\b(?:луч|лич)\s+(?:духтар|зан|бадан|ҷисм|чисм)\w*",
    r"\bсина(?:ҳо|хо|аш|ҳояш|хояш)?\s+(?:луч|лич|кушода|намоён)\b",
    # Узбекский
    r"\bялан[ғг]оч\w*",
]
_NSFW_TEXT_LAT_PATTERNS = [
    r"\bsex(?:y|ual|ually)?\b", r"\bporn\w*", r"\bnudes?\b|\bnudity\b", r"\bnaked\b",
    r"\bboobs?\b|\btits\b|\btitties\b|\btopless\b|\bnipples?\b",
    r"\bpussy\b|\bvagina\b|\bpenis\b|\bdick\b|\bcock\b|\bfuck\w*|\bhentai\b|\bnsfw\b|\berotic\w*|\bxxx\b",
    r"\bbe\s*libos\b|\bbarahna\b|\bduxtari\s+l[ui]ch\b|\bsinaho\w*\s+l[ui]ch\b|\byalang['`ʻ]?och\b",
]
_MINOR_TEXT_EXPLICIT_RE = re.compile(
    r"(?iu)\b(?:гол(?:ый|ая|ые|ую|енький|енькая|ышом)|обнаж\w*|раздет\w*|сиськ\w*|трусик\w*|нижн\w+\s+бель\w*|бикини|купальник\w*|"
    r"интим\w*|секс\w*|эроти\w*|порн\w*|бе\s*либос|бара[ҳх]на\w*|ша[ҳх]вон\w*|луч|лич|"
    r"nude|naked|topless|sexy|bikini|lingerie|underwear|boobs?|erotic|nsfw|porn\w*)\b"
)


def _check_nsfw_safety_text(raw_text: str, prior_messages: Optional[List[Dict[str, str]]] = None) -> Optional[Dict[str, str]]:
    text = (raw_text or "").strip()
    if not text:
        return None
    own_lang = _detect_utterance_own_language(text, prior_messages)
    collapsed = _collapse_spaced_letters(text.lower())
    # Маскировка `се**с`, `п*зд@`, `г*лая` — как и раньше (токены без символов маскировки сюда не попадают)
    if _matches_wildcard_masked_banned_word(collapsed):
        return {"blocked": "nsfw_masked", "lang": own_lang, "message": safety_refusal_message(own_lang)}
    wildcard_norm = _MASK_CHARS_RE.sub("х", collapsed)
    views = (collapsed, wildcard_norm.translate(_LEET_CYR_MAP))
    lat_views = (collapsed, wildcard_norm.translate(_LEET_LAT_MAP))
    # 1. CSAM — нулевая терпимость: возраст < 18 + явная нагота/секс
    if _MINOR_AGE_RE.search(collapsed) and any(_MINOR_TEXT_EXPLICIT_RE.search(v) for v in views + lat_views):
        return {"blocked": "minor_safety", "lang": own_lang, "message": safety_refusal_message(own_lang)}
    for pat in _NSFW_PERSIAN_PATTERNS:
        if re.search(pat, collapsed):
            return {"blocked": "nsfw", "lang": own_lang, "message": safety_refusal_message(own_lang)}
    for pat in _NSFW_TEXT_CYR_PATTERNS:
        if any(re.search(pat, v, flags=re.IGNORECASE) for v in views):
            return {"blocked": "nsfw", "lang": own_lang, "message": safety_refusal_message(own_lang)}
    for pat in _NSFW_TEXT_LAT_PATTERNS:
        if any(re.search(pat, v, flags=re.IGNORECASE) for v in lat_views):
            return {"blocked": "nsfw", "lang": own_lang, "message": safety_refusal_message(own_lang)}
    return None


def check_nsfw_safety(
    raw_text: str,
    prior_messages: Optional[List[Dict[str, str]]] = None,
    is_image_context: bool = False,
) -> Optional[Dict[str, str]]:
    """Фото — строгий фильтр (без изменений); текст — точный фильтр без ложных срабатываний."""
    if is_image_context:
        return _check_nsfw_safety_strict(raw_text, prior_messages, is_image_context=True)
    return _check_nsfw_safety_text(raw_text, prior_messages)


_SIMPLE_LATEX_FRAC_RE = re.compile(r"\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")
_LATEX_TEXT_CMD_RE = re.compile(r"\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}")
_LATEX_SQRT_CMD_RE = re.compile(r"\\sqrt\s*\{([^{}]*)\}")


def _clean_latex_math(text: str) -> str:
    if "\\" not in text and "$$" not in text:
        return text
    s = text
    for _ in range(2):
        s = _LATEX_TEXT_CMD_RE.sub(lambda m: m.group(1), s)
        s = _LATEX_SQRT_CMD_RE.sub(
            lambda m: f"√{m.group(1).strip()}" if len(m.group(1).strip()) <= 2 and m.group(1).strip().isalnum() else f"√({m.group(1).strip()})",
            s,
        )
    for _ in range(4):
        if "frac" not in s:
            break
        def _fmt_frac(m: re.Match) -> str:
            num = m.group(1).strip()
            den = m.group(2).strip()
            num_p = f"({num})" if any(c in num for c in "+-= ") and not (num.startswith("(") and num.endswith(")")) else num
            den_p = f"({den})" if any(c in den for c in "+-= /") and not (den.startswith("(") and den.endswith(")")) else den
            return f"{num_p}/{den_p}"
        s = _SIMPLE_LATEX_FRAC_RE.sub(_fmt_frac, s)
    replacements = (
        ("\\[", " "), ("\\]", " "), ("\\(", ""), ("\\)", ""), ("$$", " "),
        ("\\displaystyle", ""), ("\\left(", "("), ("\\right)", ")"),
        ("\\left[", "["), ("\\right]", "]"), ("\\left", ""), ("\\right", ""),
        ("\\Longrightarrow", " ⇒ "), ("\\Rightarrow", " ⇒ "),
        ("\\longrightarrow", " → "), ("\\rightarrow", " → "), ("\\to", " → "),
        ("\\times", "×"), ("\\cdot", "·"), ("\\div", "÷"), ("\\pm", "±"),
        ("\\approx", "≈"), ("\\neq", "≠"), ("\\ne", "≠"),
        ("\\leq", "≤"), ("\\le", "≤"), ("\\geq", "≥"), ("\\ge", "≥"),
        ("\\,", " "), ("\\;", " "), ("\\!", ""), ("\\quad", " "), ("\\qquad", "  "),
    )
    for k, v in replacements:
        s = s.replace(k, v)
    return s


def _repair_mixed_script_words_in_prose(text: str) -> str:
    """Чинит или очищает случайные вставки латиницы/арабицы внутри кириллических слов (`логарitми` -> `логарифми`, `пیشоҳишгӯӣ` -> `пешгӯӣ`)."""
    lat_to_cyr = str.maketrans({
        "a": "а", "e": "е", "i": "и", "o": "о", "p": "р", "c": "с", "x": "х", "y": "у", "k": "к", "t": "т", "m": "м",
        "A": "А", "E": "Е", "I": "И", "O": "О", "P": "Р", "C": "С", "X": "Х", "Y": "У", "K": "К", "T": "Т", "M": "М",
    })

    def _fix_word(m: re.Match) -> str:
        w = m.group(0)
        # Удаляем случайные арабские буквы, попавшие внутрь кириллического слова
        w = re.sub(r"[\u0600-\u06FF]+", "", w)
        if w.lower() == "логарitми":
            return "логарифмӣ"
        w = w.translate(lat_to_cyr)
        # Если остались непереводимые латинские хвосты внутри кириллического слова — срезаем их
        w = re.sub(r"[A-Za-z]+", "", w)
        return w

    return _MIXED_SCRIPT_CORRUPT_WORD_RE.sub(_fix_word, text)


def _strip_orphaned_markdown_markers(text: str) -> str:
    """Убирает оборванные `**` (`Столица:**`), висячие `»*` и сырые маркеры цитат `> `."""
    out_lines: List[str] = []
    for raw_ln in text.splitlines():
        ln = re.sub(r"^\s*>\s+", "", raw_ln)
        ln = re.sub(r"([»\"”])\*+(?=\s|$|[.,;:!?])", r"\1", ln)
        if ln.count("**") % 2 == 1:
            ln = ln.replace("**", "")
        out_lines.append(ln)
    return "\n".join(out_lines)


def _sanitize_prose_segment(seg: str, target_lang: str) -> str:
    s = _THIRD_PARTY_BRAND_RE.sub("Алия" if target_lang in ("ru", "tg") else "Aliya", seg)
    s = _CJK_RE.sub("", s)
    s = _clean_latex_math(s)
    if target_lang in ("tg", "ru"):
        s = _repair_mixed_script_words_in_prose(s)
    if target_lang == "tg":
        s = re.sub(r"(?im)^\s*[-•*]?\s*Сводка поиска\s*(?:\(\d{4}\))?\s*[:—-]?\s*", "", s)
        s = re.sub(r"(?im)^\s*[-•*]?\s*Справка\s*[:—-]\s*", "", s)
    if target_lang in ("tg", "ru", "en"):
        # Оставляем арабско-персидскую вязь, если это осмысленный фрагмент (>= 10 символов, например цитата или пример письменности),
        # и удаляем только одиночный случайный шум токенизатора (1–6 символов).
        s = re.sub(r"(?<![\u0600-\u06FF])[\u0600-\u06FF]{1,6}(?![\u0600-\u06FF])", "", s)
    s = _strip_orphaned_markdown_markers(s)
    s = _DOT_SPAM_RE.sub(".", s)
    s = re.sub(r"(?:\.\s*){2,}", ".", s)
    # Схлопываем лишние пробелы только внутри строк, не трогая переводы строк.
    s = re.sub(r"[^\S\r\n]{2,}", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s


def _sanitize_llm_reply(raw_text: str, target_lang: str) -> str:
    """
    Жёсткая очистка вывода любого Учителя / LLM с полным сохранением блоков кода (` ```...``` `):
      - срезает любые просочившиеся спецтокены и чужие реплики (`<|im_end|>`, `蠼user`, `sistênciauser`, `user:`);
      - сохраняет HTML-теги, отступы, пробелы и имена библиотек внутри блоков кода нетронутыми;
      - заменяет случайные упоминания сторонних брендов в обычном тексте на «Алия»;
      - убирает случайные иероглифы CJK и спам точками `.....`.
    """
    text = (raw_text or "").strip()
    if "</think>" in text:
        text = text.split("</think>", 1)[1].strip()
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    m_leak = _TURN_LEAK_RE.search(text)
    if m_leak:
        text = text[:m_leak.start()].strip()

    if not text:
        return ""

    segments = _CODE_FENCE_SPLIT_RE.split(text)
    cleaned_segments: List[str] = []
    for seg in segments:
        if not seg:
            continue
        if seg.lstrip().startswith("```"):
            cleaned_segments.append(seg)
        else:
            cleaned_segments.append(_sanitize_prose_segment(seg, target_lang))
    return "".join(cleaned_segments).strip()


def _validate_layer2_tajik(layer1_reply: str, layer2_reply: str) -> bool:
    """Проверяет, что Слой 2 (`sharipovip/aliya-7b`) сохранил все факты Слоя 1 и не внёс галлюцинаций."""
    if len(layer2_reply) < 12:
        return False
    low2 = layer2_reply.lower()
    low1 = layer1_reply.lower()
    # Запрет узбекских форм и заведомых галлюцинаций из старого базового прогона
    bad_markers = (
        "ў", "учун ", "билан ", "қилиш", "бўлади", "қурбоналӣ", "курбонали",
        "амиrol", "ҳиндустон", "армания", "бобоҷонӣ", "ӯлтюк",
    )
    if any(b in low2 for b in bad_markers):
        return False
    # Все значимые числа/годы из Слоя 1 обязаны сохраниться в Слое 2
    nums1 = set(re.findall(r"\b\d{2,4}\b", low1))
    if nums1 and not nums1.issubset(set(re.findall(r"\b\d{2,4}\b", low2))):
        return False
    if ("раҳмон" in low1 or "рахмон" in low1) and not ("раҳмон" in low2 or "рахмон" in low2):
        return False
    # Защита от зацикливания фраз
    words = re.findall(r"[а-яёӣқӯҳҷғ]+", low2)
    if len(words) >= 12 and len(set(words)) / float(len(words)) < 0.38:
        return False
    return any("а" <= ch <= "я" or ch in "ӣқӯҳҷғ" for ch in low2)


def _collect_stop_token_ids(tok: Any) -> List[int]:
    ids = set()
    if getattr(tok, "eos_token_id", None) is not None:
        if isinstance(tok.eos_token_id, list):
            ids.update(int(x) for x in tok.eos_token_id)
        else:
            ids.add(int(tok.eos_token_id))
    for tok_str in ("<|im_end|>", "<|endoftext|>", "<|im_start|>"):
        try:
            tid = tok.convert_tokens_to_ids(tok_str)
            if isinstance(tid, int) and tid >= 0 and tid != getattr(tok, "unk_token_id", -1):
                ids.add(tid)
        except Exception:
            pass
    return sorted(ids) if ids else [151645, 151643]


def _prepare_language_aligned_messages(
    messages: List[Dict[str, str]],
    target_lang: str,
    explicit_lang: bool,
    search_context: str = "",
    concise_voice: bool = False,
    reasoning_mode: str = "medium",
) -> List[Dict[str, str]]:
    """
    Гарантирует, что язык системной инструкции совпадает с языком вопроса пользователя
    (полностью отвязывает мозг ИИ от выбранного языка меню интерфейса!), запрещает упоминание
    сторонних брендов, учитывает выбранный режим рассуждения и добавляет свежие факты из поиска.
    """
    rmode = (reasoning_mode or "medium").strip().lower()
    voice_hint = {
        "tg": " Кӯтоҳ, равон ва дар 2–3 ҷумлаи пурра (бе рӯйхатҳои рақамӣ ва бе ҷумлаҳои зиёдатии расмӣ дар охир) ҷавоб деҳ." if concise_voice else "",
        "ru": " Ответь лаконично в 2–3 законченных предложениях без нумерованных списков и без шаблонных фраз в конце («Если вам нужны дополнительные детали...»)." if concise_voice else "",
        "en": " Reply concisely in 2–3 complete sentences without numbered lists or boilerplate closings." if concise_voice else "",
        "fa": "",
    }[target_lang]

    depth_hint = ""
    if not concise_voice:
        if rmode == "normal":
            depth_hint = {
                "tg": " Кӯтоҳ, мушаххас ва бе муқаддимаи зиёдатӣ ҷавоб деҳ.",
                "ru": " Отвечай кратко, прямо и сразу по делу без лишних вступлений.",
                "en": " Keep the answer brief, direct, and to the point.",
                "fa": "",
            }[target_lang]
        elif rmode == "high":
            depth_hint = {
                "tg": " Масъаларо ҳамаҷониба ва амиқ таҳлил кун, ҳар як далелро санҷ ва ҷавоби пурраву мураттаб пешниҳод намо.",
                "ru": " Проведи глубокий всесторонний анализ, перепроверь все факты и дай подробный, логически выстроенный ответ.",
                "en": " Perform a thorough multi-step analysis, verify every fact, and provide a comprehensive structured answer.",
                "fa": "",
            }[target_lang]

    honesty_rule = {
        "tg": (
            " Ҳеҷ гоҳ номи китобҳо, муаллифон, саҳифаҳо ё суроғаҳои интернетиро (URL) худсарона набоф; "
            "агар манбаи дақиқ дар маълумоти ҷустуҷӯ набошад, ростқавлона бигӯ, ки манбаи мушаххас санҷида нашудааст. "
            "Ҳеҷ гоҳ дар ҷавоби тоҷикӣ иқтибосҳои англисӣ ё русӣ («Сводка поиска», «The sources indicate...») нагузор — ҳамаи маълумотро пурра ва равон танҳо бо забони тоҷикӣ баён кун. "
            "Дар забони тоҷикӣ ибораи «тарҷумаи ҳол» (ё «тарчумаи хол») маънои «зиндагинома / биография»-ро дорад — ҳаргиз онро бо тарҷумаи матн ба забони дигар омехта накун! "
            "Зарбулмасали «Семь раз отмерь, один раз отрежь» дар забони тоҷикӣ маҳз «Ҳафт бор чен кун, як бор бур» мешавад (ҳаргиз калимаҳои ӯзбекии «ӯлч», «олчов» ё «туғил»-ро истифода набар!). "
            "Ихтисораҳои расмиро бо тоҷикӣ навис: СММ (на ОН), ИДМ (на СНГ/ИСТ). "
            "Калимаҳои гуфтугӯии эронӣ («микунам», «хуне», «мерсӣ»), калимаҳои сохтаву омехтаи русӣ-тоҷикӣ («взвешидан») ва ҳарфҳои лотинӣ ё арабӣ дар дохили калимаҳои кириллиро ҳаргиз истифода набар! "
            "Калимаи «Салом»-ро ҷудогона шарҳ надеҳ, ба савол бевосита ҷавоб деҳ. "
            "Ҷадвалҳои Markdown танҳо вақте соз, ки корбар ҷадвал ё муқоиса пурсида бошад. "
            "Формулаҳои математикиро бе рамзҳои LaTeX (бе \\frac, \\dfrac, \\[, \\() оддӣ навис, масалан: 1/15, c = 1/6 - (1/15 + 1/20). "
            "Ҳангоми навиштани иншо ё реферат танҳо худи матни иншоро навис. "
            "Кодҳои барномасозиро ҳамеша дар дохили блоки ```забон ... ``` бо нигоҳ доштани ҳамаи тегҳо ва фосилаҳо навис."
        ),
        "ru": (
            " Никогда не выдумывай названия книг, авторов, страницы или ссылки URL; "
            "если точный проверенный источник не передан в результатах поиска, честно скажи об этом. "
            "О действующих главах государств и текущих должностях говори строго в настоящем времени («занимает пост с ...», а не «занимал»). "
            "Не смешивай языки и не разбирай приветствие по словам — сразу отвечай по сути. "
            "Таблицы используй только там, где нужно сравнение или табличная сводка. "
            "Математические формулы пиши просто и читаемо без сырого LaTeX (без \\frac, \\dfrac, \\[, \\(), например: 1/15, c = 1/6 - (1/15 + 1/20). "
            "При запросе иншо, сочинения или эссе пиши само произведение без непрошеных советов о копировании в Word. "
            "Программный код всегда оформляй в блок ```язык ... ``` с полным сохранением всех тегов и отступов."
        ),
        "en": (
            " Never fabricate book titles, authors, page numbers, or URLs; if no verified source was retrieved, say so honestly. "
            "Do not mix languages, and write math formulas cleanly without raw LaTeX (no \\frac, \\dfrac, \\[, \\(), e.g. 1/15, c = 1/6 - (1/15 + 1/20). "
            "When asked for an essay, output the essay itself without unsolicited instructions about copying into Word. "
            "Always wrap source code inside ```language ... ``` fences preserving all tags and indentation."
        ),
        "fa": "",
    }[target_lang]

    lang_directive = {
        "tg": (
            "Ту Алия ҳастӣ — ёрдамчии зеҳнӣ ва боақли ширкати Sharipov (ҳеҷ гоҳ номи ширкат ё модели бегонаро зикр накун). "
            "Танҳо бо забони тоҷикии адабии соф (бо ҳарфҳои кириллӣ: ӣ, қ, ӯ, ҳ, ҷ, ғ; ҳаргиз ҳарфи ӯзбекии «ў» ва калимаҳои «учун», «билан», «бўлади», «эмас»-ро истифода набар) "
            "дақиқ, бомантиқ ва фаҳмо ҷавоб деҳ." + voice_hint + depth_hint + honesty_rule
        ),
        "ru": (
            "Ты Алия — умная, точная и доброжелательная ИИ-помощница компании Sharipov (никогда не называй себя чужими моделями). "
            "Отвечай грамотно, логично и по существу на чистом русском языке." + voice_hint + depth_hint + honesty_rule
        ),
        "en": (
            "You are Aliya, an intelligent and accurate AI assistant created by Sharipov (never mention third-party model names). "
            "Reply clearly, logically, and concisely in natural English." + voice_hint + depth_hint + honesty_rule
        ),
        "fa": (
            "You are Aliya, a helpful AI assistant by Sharipov. Reply naturally and accurately in Persian (Farsi)."
        ),
    }[target_lang]

    facts_note = _build_verified_tj_facts(messages, target_lang)
    if search_context:
        search_hdr = {
            "tg": "\n\nМаълумоти санҷидашуда аз ҷустуҷӯи зинда (мазмуни ин далелҳоро танҳо бо забони тоҷикӣ равон баён кун, бе URL ва бе иқтибоси англисӣ/русӣ):\n",
            "ru": "\n\nСвежие проверенные данные из живого поиска (используй эти факты на русском языке без выдумок и без ссылок URL):\n",
            "en": "\n\nVerified live search facts (use these facts naturally in English without fabricating details or raw URLs):\n",
            "fa": "\n\nVerified live search facts:\n",
        }[target_lang]
        facts_note += f"{search_hdr}{search_context}"

    prepared: List[Dict[str, str]] = []
    has_sys = False
    for m in messages:
        role = m.get("role", "user")
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        if role == "system":
            has_sys = True
            # Сохраняем только нейтральные строки профиля/памяти без переноса русскоязычных инструкций интерфейса в таджикский/английский диалог
            extra_lines: List[str] = []
            for ln in content.splitlines():
                s_ln = ln.strip()
                if not s_ln or s_ln.startswith(("Ту Алия", "Ты Алия", "You are Aliya")):
                    continue
                if target_lang != "ru" and any(
                    ru_hdr in s_ln
                    for ru_hdr in ("Недавний контекст беседы", "Точная справочная выдержка", "Запомненные факты", "Не смешивай языки")
                ):
                    continue
                extra_lines.append(s_ln)
            merged_sys = lang_directive + facts_note
            if extra_lines:
                merged_sys += "\n" + "\n".join(extra_lines)
            prepared.append({"role": "system", "content": merged_sys})
        else:
            prepared.append({"role": role, "content": content})

    if not has_sys:
        prepared.insert(0, {"role": "system", "content": lang_directive + facts_note})
    elif explicit_lang:
        explicit_note = {
            "tg": "\nМУҲИМ: корбар хоҳиш кард, ки ҷавоб маҳз бо забони тоҷикӣ бошад — танҳо бо забони тоҷикӣ ҷавоб деҳ!",
            "ru": "\nВАЖНО: пользователь явно попросил написать этот ответ именно на русском языке — отвечай строго на русском!",
            "en": "\nIMPORTANT: the user explicitly requested this answer in English — reply strictly in English!",
            "fa": "\nIMPORTANT: reply strictly in Persian (Farsi)!",
        }[target_lang]
        prepared[0]["content"] += explicit_note
    return prepared


def _generate_with_cached_causal_lm(
    cache_slot: Dict[str, Any],
    model_id: str,
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    hf_tok: Optional[str],
    use_dtype: Any,
) -> str:
    import gc
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    is_4bit_bnb = "bnb-4bit" in model_id.lower()
    is_gemma3 = "gemma-3" in model_id.lower()

    if cache_slot.get("model") is None or cache_slot.get("model_id") != model_id:
        cache_slot.clear()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        tok = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True, token=hf_tok)
        load_kwargs: Dict[str, Any] = {
            "low_cpu_mem_usage": True,
            "trust_remote_code": True,
            "token": hf_tok,
        }
        if is_4bit_bnb:
            load_kwargs["device_map"] = {"": 0} if torch.cuda.is_available() else "auto"
        else:
            load_kwargs["torch_dtype"] = use_dtype

        mod = None
        if is_gemma3:
            try:
                from transformers import Gemma3ForConditionalGeneration
                mod = Gemma3ForConditionalGeneration.from_pretrained(model_id, **load_kwargs)
            except Exception:
                mod = None
        if mod is None:
            mod = AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs)
        mod.eval()
        cache_slot["model_id"] = model_id
        cache_slot["tokenizer"] = tok
        cache_slot["model"] = mod

    tok = cache_slot["tokenizer"]
    mod = cache_slot["model"]
    if not is_4bit_bnb:
        mod = mod.to("cuda")

    # Gemma-3 ожидает список блоков или текст без роли system у некоторых шаблонов — склеиваем system в первый user при необходимости
    chat_input: List[Dict[str, Any]] = messages
    if is_gemma3 and messages and messages[0].get("role") == "system":
        sys_txt = messages[0]["content"]
        rest = [dict(m) for m in messages[1:]]
        if rest and rest[0].get("role") == "user":
            rest[0]["content"] = f"{sys_txt}\n\n{rest[0]['content']}"
            chat_input = rest

    try:
        rendered_prompt = tok.apply_chat_template(
            chat_input,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        rendered_prompt = tok.apply_chat_template(
            chat_input,
            tokenize=False,
            add_generation_prompt=True,
        )
    enc = tok(rendered_prompt, return_tensors="pt").to("cuda")
    prompt_len = enc["input_ids"].shape[1]
    stop_ids = _collect_stop_token_ids(tok)
    pad_id = tok.pad_token_id if getattr(tok, "pad_token_id", None) is not None else stop_ids[0]
    temp = max(0.05, min(0.85, float(temperature)))
    with torch.inference_mode():
        out = mod.generate(
            **enc,
            max_new_tokens=max(8, min(640, int(max_tokens))),
            temperature=temp,
            top_p=0.9,
            repetition_penalty=1.07,
            do_sample=(temp > 0.12),
            eos_token_id=stop_ids,
            pad_token_id=pad_id,
        )
    return tok.decode(out[0][prompt_len:], skip_special_tokens=True).strip()


def _run_chat_on_cuda(messages: List[Dict[str, str]], temperature: float, max_tokens: int, search_context: str = "") -> Dict[str, Any]:
    """
    Встроенный Совет Учителей на вашем бесплатном ZeroGPU (работает без внешних ключей):
      • Для таджикского (`tg`): Учитель `Gemma-3-27B-it` (27 млрд) -> резерв `Qwen3-14B` (14.8 млрд) -> `Qwen3-8B`.
      • Для русского/английского/логики (`ru`/`en`): Учитель `Qwen3-14B` (14.8 млрд) -> `Gemma-3-27B-it` -> `Qwen3-8B`.
      • Сырая модель `sharipovip/aliya-7b` НЕ перезаписывает готовый умный ответ Учителя (она учится на этих ответах в фоне!).
    """
    import gc
    import torch

    with _cuda_lock:
        hf_tok = os.getenv("HF_TOKEN", "").strip() or None
        use_dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16

        target_lang, explicit_lang = _resolve_effective_chat_lang(messages)
        concise_voice = int(max_tokens) <= 150
        aligned_messages = _prepare_language_aligned_messages(
            messages, target_lang, explicit_lang, search_context=search_context, concise_voice=concise_voice
        )

        if _zerogpu_image_cache.get("pipe") is not None:
            try:
                _zerogpu_image_cache["pipe"].to("cpu")
                torch.cuda.empty_cache()
            except Exception:
                pass

        if target_lang == "tg":
            candidates = [ZEROGPU_TEACHER_TAJIK_MODEL, ZEROGPU_TEACHER_LOGIC_MODEL, REASONING_LAYER1_MODEL]
        else:
            candidates = [ZEROGPU_TEACHER_LOGIC_MODEL, ZEROGPU_TEACHER_TAJIK_MODEL, REASONING_LAYER1_MODEL]
        if _is_aliya_custom_model_ready(hf_tok or ""):
            candidates.append(PRIMARY_ALIYA_HF_MODEL)

        seen_m = set()
        ordered_candidates = [m for m in candidates if m and not (m in seen_m or seen_m.add(m))]

        for teacher_id in ordered_candidates:
            try:
                if _zerogpu_reasoning_cache.get("model_id") and _zerogpu_reasoning_cache.get("model_id") != teacher_id:
                    if _available_ram_gb() < 22.0:
                        _zerogpu_reasoning_cache.clear()
                        gc.collect()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                raw_reply = _generate_with_cached_causal_lm(
                    _zerogpu_reasoning_cache,
                    teacher_id,
                    aligned_messages,
                    temperature=min(float(temperature), 0.35) if target_lang == "tg" else float(temperature),
                    max_tokens=max_tokens,
                    hf_tok=hf_tok,
                    use_dtype=use_dtype,
                )
                clean_reply = _sanitize_llm_reply(raw_reply, target_lang)
                if len(clean_reply) >= 2:
                    return {
                        "reply": clean_reply,
                        "model": teacher_id,
                        "provider": "aliya-zerogpu-teacher",
                        "target_lang": target_lang,
                    }
            except Exception as exc:
                logging.warning("ZeroGPU teacher %s skipped (%s)", teacher_id, type(exc).__name__)
                _zerogpu_reasoning_cache.clear()
                gc.collect()
                continue

        return {"reply": "", "error": "zerogpu_teachers_unavailable"}


def _run_vision_on_cuda(image_bytes: bytes, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    import torch
    from PIL import Image
    from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

    hf_tok = os.getenv("HF_TOKEN", "").strip() or None
    if _zerogpu_vision_cache.get("model") is None:
        proc = AutoProcessor.from_pretrained(ZEROGPU_VISION_MODEL, trust_remote_code=True, token=hf_tok)
        vmod = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            ZEROGPU_VISION_MODEL,
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
            token=hf_tok,
        )
        vmod.eval()
        _zerogpu_vision_cache["processor"] = proc
        _zerogpu_vision_cache["model"] = vmod

    proc = _zerogpu_vision_cache["processor"]
    vmod = _zerogpu_vision_cache["model"].to("cuda")
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    pil_img.thumbnail((1024, 1024))
    chat_msgs: List[Dict[str, Any]] = []
    if system_prompt:
        chat_msgs.append({"role": "system", "content": system_prompt})
    chat_msgs.append({
        "role": "user",
        "content": [
            {"type": "image", "image": pil_img},
            {"type": "text", "text": user_prompt},
        ],
    })
    text_prompt = proc.apply_chat_template(chat_msgs, tokenize=False, add_generation_prompt=True)
    inputs = proc(text=[text_prompt], images=[pil_img], padding=True, return_tensors="pt").to("cuda")
    with torch.no_grad():
        gen_ids = vmod.generate(**inputs, max_new_tokens=512, temperature=0.25, do_sample=True)
    trimmed = gen_ids[0][inputs.input_ids.shape[1]:]
    reply = proc.decode(trimmed, skip_special_tokens=True).strip()
    return {"reply": reply, "model": ZEROGPU_VISION_MODEL, "provider": "aliya-zerogpu-vision"}


def _decode_wav_pcm16_mono_16k(wav_bytes: bytes):
    import numpy as np

    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        raw_frames = wf.readframes(wf.getnframes())
    if sampwidth != 2 or not raw_frames:
        raise ValueError("Unsupported WAV format")
    audio = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    if framerate != 16000 and framerate > 0 and len(audio) > 16:
        target_len = max(1, int(round(len(audio) * 16000.0 / float(framerate))))
        audio = np.interp(
            np.linspace(0.0, len(audio) - 1, target_len, dtype=np.float32),
            np.arange(len(audio), dtype=np.float32),
            audio,
        ).astype(np.float32)
    return audio


def _safe_preload_mms():
    try:
        _ensure_mms_tajik_loaded_cpu()
    except Exception as exc:
        logging.warning("MMS preload skipped (%s)", type(exc).__name__)


def _ensure_mms_tajik_loaded_cpu():
    """
    Лениво подгружает `facebook/mms-1b-all` и сразу активирует родной таджикский адаптер `tgk`
    ДО переноса на GPU (исключает конфликт типов float32/bfloat16 и ускоряет холодный старт).
    """
    from transformers import AutoProcessor, Wav2Vec2ForCTC

    with _mms_init_lock:
        if _zerogpu_mms_cache.get("model") is not None:
            return _zerogpu_mms_cache["processor"], _zerogpu_mms_cache["model"]
        hf_tok = os.getenv("HF_TOKEN", "").strip() or None
        proc = AutoProcessor.from_pretrained(ZEROGPU_MMS_MODEL, token=hf_tok)
        proc.tokenizer.set_target_lang("tgk")
        mod = Wav2Vec2ForCTC.from_pretrained(
            ZEROGPU_MMS_MODEL,
            low_cpu_mem_usage=True,
            token=hf_tok,
        )
        mod.load_adapter("tgk")
        mod.eval()
        _zerogpu_mms_cache["processor"] = proc
        _zerogpu_mms_cache["model"] = mod
        return proc, mod


def _run_mms_tajik_on_audio(audio: Any, torch_mod: Any) -> str:
    proc, mod = _ensure_mms_tajik_loaded_cpu()
    mms_dtype = torch_mod.bfloat16 if (torch_mod.cuda.is_available() and torch_mod.cuda.is_bf16_supported()) else torch_mod.float32
    mod = mod.to(device="cuda", dtype=mms_dtype)
    inputs = proc(audio, sampling_rate=16000, return_tensors="pt")
    input_values = inputs.input_values.to(device="cuda", dtype=mms_dtype)
    with torch_mod.inference_mode():
        logits = mod(input_values).logits
    pred_ids = torch_mod.argmax(logits, dim=-1)
    text = proc.batch_decode(pred_ids)[0].strip()
    text = re.sub(r"(.)\1{4,}", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def _looks_like_tajik_speech(text: str) -> bool:
    if not text:
        return False
    if any("\u0600" <= ch <= "\u06FF" for ch in text) or any(ch in "ӣқӯҳҷғӢҚӮҲҶҒ" for ch in text):
        return True
    words = re.findall(r"[а-яё]+", text.lower().replace("ё", "е"))
    if not words:
        return False
    tj_hits = sum(1 for w in words if w in _CHAT_TJ_WORDS)
    ru_hits = sum(1 for w in words if w in _CHAT_RU_WORDS)
    return tj_hits >= 1 and tj_hits >= ru_hits


def _run_stt_on_cuda(wav_bytes: bytes, lang_code: str) -> Dict[str, Any]:
    """
    v3.0.5 — Двухслойное распознавание речи, полностью независимое от языка интерфейса:
      • В режиме `auto` (по умолчанию из мобильного приложения):
        1) Слой 1 (`whisper-large-v3-turbo` с автоопределением языка) мгновенно распознаёт
           русскую, английскую и таджикскую речь.
        2) Если услышана таджикская речь (в том числе записанная Whisper арабско-персидской вязью
           или без диакритики), Слой 2 (`facebook/mms-1b-all` с родным адаптером `tgk`) выдаёт
           точную таджикскую кириллицу (`ӣ, қ, ӯ, ҳ, ҷ, ғ`)!
      • При явном `lang_code == "tg"` сразу работает `mms-1b-all (tgk)` с резервом Whisper.
    """
    import numpy as np
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

    audio = _decode_wav_pcm16_mono_16k(wav_bytes)
    if len(audio) < 2400:
        return {"text": "", "language": lang_code, "provider": "aliya-empty"}
    rms = float(np.sqrt(np.mean(np.square(audio))))
    if rms < 0.0028:
        return {"text": "", "language": lang_code, "provider": "aliya-silent"}

    with _cuda_lock:
        hf_tok = os.getenv("HF_TOKEN", "").strip() or None

        if lang_code == "tg":
            try:
                mms_txt = _run_mms_tajik_on_audio(audio, torch)
                if len(mms_txt) >= 2:
                    return {"text": mms_txt, "language": "tg", "provider": "aliya-mms-tajik"}
            except Exception as exc:
                logging.warning("MMS Tajik ASR fallback to Whisper (%s)", type(exc).__name__)

        if _zerogpu_whisper_cache.get("model") is None:
            wproc = AutoProcessor.from_pretrained(ZEROGPU_WHISPER_MODEL, token=hf_tok)
            wmod = AutoModelForSpeechSeq2Seq.from_pretrained(
                ZEROGPU_WHISPER_MODEL,
                torch_dtype=torch.float16,
                low_cpu_mem_usage=True,
                token=hf_tok,
            )
            wmod.eval()
            _zerogpu_whisper_cache["processor"] = wproc
            _zerogpu_whisper_cache["model"] = wmod

        wproc = _zerogpu_whisper_cache["processor"]
        wmod = _zerogpu_whisper_cache["model"].to("cuda")

        winputs = wproc(audio, sampling_rate=16000, return_tensors="pt")
        input_features = winputs.input_features.to("cuda", dtype=torch.float16)

        gen_kwargs: Dict[str, Any] = {
            "task": "transcribe",
            "max_new_tokens": 128,
            "no_repeat_ngram_size": 3,
            "repetition_penalty": 1.2,
        }
        if lang_code in ("tg", "ru", "en"):
            gen_kwargs["language"] = {"tg": "tajik", "ru": "russian", "en": "english"}[lang_code]

        with torch.inference_mode():
            pred_ids = wmod.generate(input_features, **gen_kwargs)
        text = wproc.batch_decode(pred_ids, skip_special_tokens=True)[0].strip()
        text = re.sub(r"(.)\1{4,}", r"\1", text).strip()

        # В универсальном режиме `auto`, если Whisper услышал таджикскую/персидскую фонетику —
        # второй слой `mms-1b-all (tgk)` восстанавливает чистую таджикскую кириллицу!
        if lang_code == "auto" and _looks_like_tajik_speech(text):
            try:
                mms_txt = _run_mms_tajik_on_audio(audio, torch)
                if len(mms_txt) >= 2 and any("а" <= ch.lower() <= "я" or ch in "ӣқӯҳҷғӢҚӮҲҶҒ" for ch in mms_txt):
                    return {"text": mms_txt, "language": "tg", "provider": "aliya-layered-stt-tg"}
            except Exception as exc:
                logging.warning("Layered MMS Tajik refinement skipped (%s)", type(exc).__name__)

        if len(text) < 2:
            text = ""
        detected_lang = "tg" if _looks_like_tajik_speech(text) else (
            "en" if (text and not any("а" <= ch.lower() <= "я" for ch in text) and any("a" <= ch.lower() <= "z" for ch in text)) else "ru"
        )
        return {
            "text": text,
            "language": detected_lang if lang_code == "auto" else lang_code,
            "provider": "aliya-zerogpu-whisper",
        }


def _translate_via_nllb(text: str, src_lang: str, use_cuda: bool = False) -> str:
    """Локальный переводчик NLLB-200 (tgk_Cyrl / rus_Cyrl -> eng_Latn) прямо внутри Space без внешних ключей."""
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    hf_tok = os.getenv("HF_TOKEN", "").strip() or None
    if _translator_cache.get("model") is None:
        tok = AutoTokenizer.from_pretrained(ZEROGPU_TRANSLATION_MODEL, token=hf_tok)
        mod = AutoModelForSeq2SeqLM.from_pretrained(
            ZEROGPU_TRANSLATION_MODEL,
            torch_dtype=torch.float16 if use_cuda else torch.float32,
            low_cpu_mem_usage=True,
            token=hf_tok,
        )
        mod.eval()
        _translator_cache["tokenizer"] = tok
        _translator_cache["model"] = mod

    tok = _translator_cache["tokenizer"]
    mod = _translator_cache["model"]
    target_dev = "cuda" if (use_cuda and torch.cuda.is_available()) else "cpu"
    if use_cuda and torch.cuda.is_available():
        mod = mod.to(device="cuda", dtype=torch.float16)
    else:
        mod = mod.to(device="cpu", dtype=torch.float32)

    src_code = {"tg": "tgk_Cyrl", "ru": "rus_Cyrl", "fa": "pes_Arab"}.get(src_lang, "rus_Cyrl")
    tok.src_lang = src_code
    inputs = tok(text, return_tensors="pt", truncation=True, max_length=128).to(target_dev)
    forced_bos_id = tok.convert_tokens_to_ids("eng_Latn")
    with torch.inference_mode():
        out = mod.generate(
            **inputs,
            forced_bos_token_id=forced_bos_id,
            max_new_tokens=96,
            num_beams=2,
            no_repeat_ngram_size=3,
        )
    return tok.batch_decode(out, skip_special_tokens=True)[0].strip()


def _run_image_on_cuda(
    raw_or_english_prompt: str,
    negative_prompt: str,
    needs_nllb: bool,
    src_lang: str,
    anchors: List[str],
    category: str,
    width: int,
    height: int,
    seed: int,
    style: str = "",
) -> bytes:
    """
    Прямая генерация изображений на собственной GPU Space (`RealVisXL V5.0 Lightning` — Модель №1):
      - Промпт подаётся уже подготовленным ИИ-мозгом на чистом английском без загрузки тяжёлой NLLB-200 в VRAM.
      - Поддерживает художественные стили (`pencil_sketch`, `watercolor`, `oil_painting`, `illustration`, `anime`, `photo`)
        и полный кадр без кропа головы/объекта.
    """
    import torch
    from diffusers import DPMSolverSinglestepScheduler, StableDiffusionXLPipeline

    with _cuda_lock:
        final_en = raw_or_english_prompt
        if needs_nllb:
            try:
                nllb_en = _translate_via_nllb(raw_or_english_prompt, src_lang=src_lang, use_cuda=False)
                nllb_clean = re.sub(r"[\u0400-\u052F\u0600-\u06FF]+", " ", nllb_en)
                nllb_clean = re.sub(r"\s+", " ", nllb_clean).strip(" ,.;:-")
                if re.search(r"[A-Za-z]{2,}", nllb_clean):
                    low_c = nllb_clean.lower()
                    missing = [a for a in anchors if a.split()[-1].rstrip("s") not in low_c]
                    if missing:
                        nllb_clean = ", ".join(missing) + ", " + nllb_clean
                    final_en = nllb_clean
            except Exception as exc:
                logging.warning("CPU NLLB translation fallback (%s)", type(exc).__name__)
                final_en = ", ".join(anchors) if anchors else "detailed high-resolution photograph"

        # Жёсткая защита: в англоязычный CLIP никогда не попадает ни одна кириллическая буква!
        final_en = re.sub(r"[\u0400-\u052F\u0600-\u06FF]+", " ", final_en)
        final_en = re.sub(r"\s+", " ", final_en).strip(" ,.;:-")
        if not re.search(r"[A-Za-z]{2,}", final_en):
            final_en = ", ".join(anchors) if anchors else "detailed high-resolution photograph"

        pos_prompt, neg_prompt, _ = _compose_sdxl_prompts(
            final_en,
            explicit_category=category,
            extra_neg=negative_prompt,
            style=style,
        )

        hf_tok = os.getenv("HF_TOKEN", "").strip() or None
        if _zerogpu_image_cache.get("pipe") is None:
            pipe = StableDiffusionXLPipeline.from_pretrained(
                ZEROGPU_IMAGE_MODEL,
                torch_dtype=torch.float16,
                variant="fp16",
                use_safetensors=True,
                token=hf_tok,
            )
            pipe.scheduler = DPMSolverSinglestepScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=True,
            )
            _zerogpu_image_cache["pipe"] = pipe

        pipe = _zerogpu_image_cache["pipe"].to("cuda")
        tw = max(512, min(1280, (int(width or 1024) // 16) * 16))
        th = max(512, min(1280, (int(height or 1024) // 16) * 16))
        gen = torch.Generator(device="cuda").manual_seed(int(seed) & 0x7FFFFFFF)
        with torch.inference_mode():
            img = pipe(
                prompt=pos_prompt,
                negative_prompt=neg_prompt,
                width=tw,
                height=th,
                num_inference_steps=7,
                guidance_scale=2.0,
                generator=gen,
            ).images[0]

        out = io.BytesIO()
        img.convert("RGB").save(out, format="JPEG", quality=98, subsampling=0, optimize=True)
        return out.getvalue()


if spaces is not None:
    _zerogpu_chat_fn = spaces.GPU(duration=60)(_run_chat_on_cuda)
    _zerogpu_vision_fn = spaces.GPU(duration=50)(_run_vision_on_cuda)
    _zerogpu_stt_fn = spaces.GPU(duration=45)(_run_stt_on_cuda)
    _zerogpu_image_fn = spaces.GPU(duration=45)(_run_image_on_cuda)
else:
    _zerogpu_chat_fn = None
    _zerogpu_vision_fn = None
    _zerogpu_stt_fn = None
    _zerogpu_image_fn = None

CANDIDATE_CLOUD_MODELS = [
    "Qwen/Qwen3.5-35B-A3B",
    "Qwen/Qwen3.5-397B-A17B",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen3-32B",
    "google/gemma-3-27b-it",
    "meta-llama/Llama-3.3-70B-Instruct",
]

CANDIDATE_VISION_MODELS = [
    "Qwen/Qwen3.5-35B-A3B",
    "Qwen/Qwen3.5-397B-A17B",
    "google/gemma-3-27b-it",
    "Qwen/Qwen2.5-VL-72B-Instruct",
    "Qwen/Qwen2.5-VL-7B-Instruct",
    "meta-llama/Llama-3.2-11B-Vision-Instruct",
]

CANDIDATE_IMAGE_MODELS = [
    "black-forest-labs/FLUX.1-schnell",
    "stabilityai/stable-diffusion-xl-base-1.0",
]

GEMINI_VOICE_MAP = {
    "eastern": "Aoede",
    "persian_dilara": "Aoede",
    "persian_shirin": "Zephyr",
    "russian_warm": "Kore",
    "english_british": "Leda",
}

EDGE_VOICE_MAP = {
    "eastern": ("fa-IR-DilaraNeural", "+2%", "+0Hz"),
    "persian_dilara": ("fa-IR-DilaraNeural", "+2%", "+0Hz"),
    "persian_shirin": ("fa-IR-DilaraNeural", "+6%", "+4Hz"),
    "russian_warm": ("ru-RU-SvetlanaNeural", "+3%", "+0Hz"),
    "english_british": ("en-GB-SoniaNeural", "+2%", "+0Hz"),
}


HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions"

# Кэш последней диагностики провайдеров (без секретов), чтобы /health?deep=1 не тратил квоту.
_provider_probe_cache: Dict[str, Any] = {"at": 0.0, "result": None}
_PROVIDER_PROBE_TTL_SEC = 300.0


def _extra_openai_providers() -> List[Dict[str, str]]:
    """
    Совет внешних Учителей Алии (OpenAI-совместимые бесплатные платформы с гигантскими моделями).
    Все ключи необязательны и читаются строго из Secrets (никогда не попадают в ответы или логи):
      • CEREBRAS_API_KEY   — Qwen3-235B-A22B (235 млрд), GPT-OSS-120B (120 млрд), Qwen3-32B (~2500 ток/с)
      • GROQ_API_KEY       — Llama-3.3-70B, Llama-4-Scout (109B MoE), Qwen3-32B (~800 ток/с)
      • OPENROUTER_API_KEY — Qwen3-235B :free, Gemma-3-27B :free, Llama-4-Maverick :free, DeepSeek-V3 :free
      • MISTRAL_API_KEY    — Mistral-Large (123 млрд), Mistral-Small (24 млрд)
      • ALIYA_EXTRA_CHAT_* — любой дополнительный OpenAI-совместимый шлюз
    """
    providers: List[Dict[str, str]] = []
    gpt_oss_fallbacks: List[Dict[str, str]] = []

    sambanova_key = os.getenv("SAMBANOVA_API_KEY", "").strip()
    if sambanova_key:
        for m in ("DeepSeek-V3.2", "DeepSeek-V3.1", "DeepSeek-V3-0324", "Meta-Llama-3.3-70B-Instruct"):
            providers.append({
                "url": "https://api.sambanova.ai/v1/chat/completions",
                "key": sambanova_key,
                "model": m,
                "name": f"sambanova:{m}",
            })

    cerebras_key = os.getenv("CEREBRAS_API_KEY", "").strip()
    if cerebras_key:
        for m in ("qwen-3-235b-a22b-instruct-2507", "qwen-3-32b", "llama-3.3-70b"):
            providers.append({
                "url": "https://api.cerebras.ai/v1/chat/completions",
                "key": cerebras_key,
                "model": m,
                "name": f"cerebras:{m}",
            })
        gpt_oss_fallbacks.append({
            "url": "https://api.cerebras.ai/v1/chat/completions",
            "key": cerebras_key,
            "model": "gpt-oss-120b",
            "name": "cerebras:gpt-oss-120b",
        })

    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_key:
        for m in (
            "moonshotai/kimi-k2-instruct",
            "meta-llama/llama-4-maverick-17b-128e-instruct",
            "llama-3.3-70b-versatile",
            "qwen/qwen3.6-27b",
            "qwen/qwen3-32b",
            "meta-llama/llama-4-scout-17b-16e-instruct",
        ):
            providers.append({
                "url": "https://api.groq.com/openai/v1/chat/completions",
                "key": groq_key,
                "model": m,
                "name": f"groq:{m}",
            })
        for m in ("openai/gpt-oss-120b", "openai/gpt-oss-20b"):
            gpt_oss_fallbacks.append({
                "url": "https://api.groq.com/openai/v1/chat/completions",
                "key": groq_key,
                "model": m,
                "name": f"groq:{m}",
            })

    openrouter_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if openrouter_key:
        for m in (
            "qwen/qwen3-235b-a22b:free",
            "deepseek/deepseek-chat-v3-0324:free",
            "google/gemma-3-27b-it:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "openrouter/free",
        ):
            providers.append({
                "url": "https://openrouter.ai/api/v1/chat/completions",
                "key": openrouter_key,
                "model": m,
                "name": f"openrouter:{m}",
            })

    cohere_key = os.getenv("COHERE_API_KEY", "").strip()
    if cohere_key:
        for m in ("command-a-03-2025", "command-r-plus-08-2024"):
            providers.append({
                "url": "https://api.cohere.ai/compatibility/v1/chat/completions",
                "key": cohere_key,
                "model": m,
                "name": f"cohere:{m}",
            })

    mistral_key = os.getenv("MISTRAL_API_KEY", "").strip()
    if mistral_key:
        for m in ("mistral-large-latest", "mistral-small-latest"):
            providers.append({
                "url": "https://api.mistral.ai/v1/chat/completions",
                "key": mistral_key,
                "name": f"mistral:{m}",
                "model": m,
            })

    zai_key = os.getenv("ZAI_API_KEY", "").strip()
    if zai_key:
        providers.append({
            "url": "https://api.z.ai/api/paas/v4/chat/completions",
            "key": zai_key,
            "model": os.getenv("ZAI_CHAT_MODEL", "glm-4.7-flash").strip() or "glm-4.7-flash",
            "name": "zai",
        })
    cf_key = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    cf_account = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if cf_key and re.fullmatch(r"[a-fA-F0-9]{32}", cf_account):
        providers.append({
            "url": f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/ai/v1/chat/completions",
            "key": cf_key,
            "model": os.getenv("CLOUDFLARE_CHAT_MODEL", "@cf/meta/llama-3.1-8b-instruct").strip() or "@cf/meta/llama-3.1-8b-instruct",
            "name": "cloudflare",
        })

    url = os.getenv("ALIYA_EXTRA_CHAT_URL", "").strip()
    key = os.getenv("ALIYA_EXTRA_CHAT_KEY", "").strip()
    model = os.getenv("ALIYA_EXTRA_CHAT_MODEL", "").strip()
    if url and key and model:
        providers.append({"url": url, "key": key, "model": model, "name": "extra-openai"})

    providers.extend(gpt_oss_fallbacks)
    return providers


_provider_cooldown_until: Dict[str, float] = {}
_last_healthy_provider_name: str = ""
_gemini_cooldown_until: float = 0.0


def _provider_health_key(name: str, secret: str) -> str:
    return f"{name}:{(secret or '')[:8]}"


def _is_provider_healthy(name: str, secret: str) -> bool:
    exp = _provider_cooldown_until.get(_provider_health_key(name, secret), 0.0)
    return time.time() >= exp


def _mark_provider_http_status(name: str, secret: str, status_code: int) -> None:
    global _last_healthy_provider_name
    key = _provider_health_key(name, secret)
    now = time.time()
    if status_code == 200:
        _provider_cooldown_until.pop(key, None)
        if "gpt-oss" not in name.lower() and "cloudflare" not in name.lower():
            _last_healthy_provider_name = name
    elif status_code in (401, 403, 404, 410):
        _provider_cooldown_until[key] = now + 21_600.0
    elif status_code == 402:
        _provider_cooldown_until[key] = now + 7_200.0
    elif status_code in (429, 502, 503):
        _provider_cooldown_until[key] = now + 90.0


def _select_healthy_providers(for_tajik: bool = False, exclude_gpt_oss: bool = False) -> List[Dict[str, str]]:
    raw_list = _extra_openai_providers()
    healthy: List[Dict[str, str]] = []
    cooled_fallbacks: List[Dict[str, str]] = []
    for p in raw_list:
        m_low = p["model"].lower()
        if (for_tajik or exclude_gpt_oss) and ("gpt-oss" in m_low or "llama-3.1-8b" in m_low):
            continue
        if _is_provider_healthy(p["name"], p["key"]):
            healthy.append(p)
        else:
            cooled_fallbacks.append(p)

    if _last_healthy_provider_name:
        healthy.sort(key=lambda x: 0 if x["name"] == _last_healthy_provider_name else 1)
    return healthy if healthy else cooled_fallbacks[:2]


# --- ТРОЙНОЙ ЖИВОЙ ПОИСК АЛИИ: Google AI Search + Yandex Search v2 + Умный Веб-Поиск (Tavily / Wiki / DDG) ---
_LIVE_SEARCH_TRIGGER_RE = re.compile(
    r"(?iu)\b("
    r"кто\s+так(?:ой|ая|ие)|что\s+такое|когда\s+был|сколько\s+жител|населени|столиц|президент|курс\s+валют|"
    r"погод[аыеу]|новост[ией]|сегодня|сейчас|вчера|2025|2026|2027|цена|стоимост|где\s+находится|история|"
    r"расскажи\s+(?:о|про)|биографи|кем\s+был|год\s+рождени|"
    r"кист|чист|дар\s+куҷо|дар\s+бораи|маълумот|зиндагинома|таваллуд|пойтахт|аҳолӣ|президент|қурб|нарх|"
    r"обу\s+ҳаво|хабар|имрӯз|ҳозир|таърих|рӯдакӣ|рудаки|сомонӣ|сомони|сино|айнӣ|ғафуров|хуҷанд|худжанд|"
    r"who\s+is|what\s+is|where\s+is|capital\s+of|population|weather|news|today|latest|price|exchange\s+rate|biography"
    r")\b"
)

_GREETING_SKIP_RE = re.compile(
    r"(?iu)^\s*(салом|привет|здравствуй\w*|добрый\s+\w+|hello|hi|как\s+дела|чӣ\s+хел|чихел|спасибо|раҳмат|рахмат)[!?.…\s]*$"
)


def _needs_live_search(query: str) -> bool:
    q = (query or "").strip()
    if len(q) < 8 or _GREETING_SKIP_RE.match(q):
        return False
    return bool(_LIVE_SEARCH_TRIGGER_RE.search(q))


def _clean_xml_text(raw_xml_fragment: str) -> str:
    txt = re.sub(r"<[^>]+>", " ", raw_xml_fragment or "")
    txt = (
        txt.replace("&quot;", '"')
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
    )
    return re.sub(r"\s+", " ", txt).strip()


def _get_yandex_folder_id() -> str:
    explicit = os.getenv("YANDEX_FOLDER_ID", "").strip()
    if explicit:
        return explicit
    # Авто-защита от опечатки при вставке в Secrets: если ID каталога (b1g...) вставили в поле Name вместо Value
    for env_k, env_v in os.environ.items():
        ks = env_k.strip()
        if re.fullmatch(r"b1[a-z0-9]{16,22}", ks):
            return ks
        if ks.upper().startswith("YANDEX_FOLDER") and env_v.strip():
            return env_v.strip()
    return ""


def _search_yandex_v2(query: str, target_lang: str) -> List[str]:
    """Официальный живой поиск Яндекса (Yandex Cloud Search API v2: rawData base64 XML)."""
    ya_key = os.getenv("YANDEX_API_KEY", "").strip()
    ya_folder = _get_yandex_folder_id()
    if not ya_key or not ya_folder:
        return []
    auth_header = f"Bearer {ya_key}" if ya_key.startswith("t1.") else f"Api-Key {ya_key}"
    search_type = "SEARCH_TYPE_COM" if target_lang == "en" else "SEARCH_TYPE_RU"
    payload = {
        "query": {
            "searchType": search_type,
            "queryText": query[:240],
            "familyMode": "FAMILY_MODE_MODERATE",
            "page": 0,
        },
        "groupSpec": {
            "groupMode": "GROUP_MODE_FLAT",
            "groupsOnPage": 4,
            "docsInGroup": 1,
        },
        "maxPassages": 2,
        "region": "225",
        "l10N": "LOCALIZATION_EN" if target_lang == "en" else "LOCALIZATION_RU",
        "responseFormat": "FORMAT_XML",
        "folderId": ya_folder,
    }
    try:
        r = httpx.post(
            "https://searchapi.api.cloud.yandex.net/v2/web/search",
            headers={"Authorization": auth_header, "Content-Type": "application/json"},
            json=payload,
            timeout=3.8,
        )
        if r.status_code != 200:
            return []
        raw_b64 = (r.json() or {}).get("rawData", "")
        if not raw_b64:
            return []
        xml_text = base64.b64decode(raw_b64).decode("utf-8", errors="ignore")
        snippets: List[str] = []
        for doc_match in re.finditer(r"<doc\b[^>]*>(.*?)</doc>", xml_text, flags=re.DOTALL):
            block = doc_match.group(1)
            title_m = re.search(r"<title>(.*?)</title>", block, flags=re.DOTALL)
            passages = re.findall(r"<passage>(.*?)</passage>", block, flags=re.DOTALL)
            headline_m = re.search(r"<headline>(.*?)</headline>", block, flags=re.DOTALL)
            title = _clean_xml_text(title_m.group(1)) if title_m else ""
            body_parts = [_clean_xml_text(p) for p in passages if _clean_xml_text(p)]
            if not body_parts and headline_m:
                body_parts = [_clean_xml_text(headline_m.group(1))]
            body = " ".join(body_parts).strip()
            if title and body:
                snippets.append(f"• {title}: {body[:280]}")
            elif body:
                snippets.append(f"• {body[:280]}")
            if len(snippets) >= 4:
                break
        return snippets
    except Exception as exc:
        logging.warning("Yandex Search v2 skipped (%s)", type(exc).__name__)
        return []


def _search_tavily(query: str) -> List[str]:
    """Умный ИИ-поиск по интернету (Tavily Search API, 1000 бесплатных запросов/мес без карты)."""
    tv_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not tv_key:
        return []
    try:
        r = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": tv_key,
                "query": query[:240],
                "search_depth": "basic",
                "include_answer": True,
                "max_results": 3,
            },
            timeout=3.6,
        )
        if r.status_code != 200:
            return []
        data = r.json() or {}
        out: List[str] = []
        ans = str(data.get("answer") or "").strip()
        if ans:
            out.append(f"• {ans[:320]}")
        for item in (data.get("results") or [])[:3]:
            t = str(item.get("title") or "").strip()
            c = re.sub(r"\s+", " ", str(item.get("content") or "")).strip()
            if c:
                out.append(f"• {t}: {c[:240]}" if t else f"• {c[:240]}")
        return out[:4]
    except Exception as exc:
        logging.warning("Tavily search skipped (%s)", type(exc).__name__)
        return []


def _search_wikipedia_and_ddg(query: str, target_lang: str) -> List[str]:
    """Бесплатный бесключевой умный поиск (Википедия TG/RU/EN + DuckDuckGo Instant Answer)."""
    out: List[str] = []
    wiki_langs = {"tg": ["tg", "ru"], "ru": ["ru", "en"], "en": ["en", "ru"], "fa": ["fa", "en"]}.get(target_lang, ["ru", "en"])
    headers = {"User-Agent": "AliyaAssistant/3.0.6 (Sharipov)"}

    for wl in wiki_langs:
        try:
            rs = httpx.get(
                f"https://{wl}.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query[:160],
                    "srlimit": 2,
                    "format": "json",
                },
                headers=headers,
                timeout=2.4,
            )
            if rs.status_code == 200:
                hits = ((rs.json() or {}).get("query") or {}).get("search") or []
                for h in hits[:2]:
                    title = str(h.get("title") or "").strip()
                    snip = _clean_xml_text(str(h.get("snippet") or ""))
                    if title and snip:
                        out.append(f"• {title} ({wl.upper()}): {snip[:240]}")
                if out:
                    break
        except Exception:
            continue

    try:
        rd = httpx.get(
            "https://api.duckduckgo.com/",
            params={"q": query[:160], "format": "json", "no_html": 1, "skip_disambig": 1},
            headers=headers,
            timeout=2.2,
        )
        if rd.status_code == 200:
            ddg = rd.json() or {}
            abs_txt = str(ddg.get("AbstractText") or ddg.get("Answer") or "").strip()
            if abs_txt:
                out.append(f"• {abs_txt[:280]}")
    except Exception:
        pass

    return out[:3]


def _gather_live_search_context(query: str, target_lang: str) -> str:
    """Параллельно опрашивает Яндекс Поиск + Tavily + Википедию/DDG за ≤3.8 сек."""
    if not _needs_live_search(query):
        return ""
    from concurrent.futures import ThreadPoolExecutor

    collected: List[str] = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        fut_ya = pool.submit(_search_yandex_v2, query, target_lang)
        fut_tv = pool.submit(_search_tavily, query)
        fut_wk = pool.submit(_search_wikipedia_and_ddg, query, target_lang)
        for fut in (fut_ya, fut_tv, fut_wk):
            try:
                res = fut.result(timeout=4.0)
                if res:
                    collected.extend(res)
            except Exception:
                continue

    deduped: List[str] = []
    seen = set()
    for item in collected:
        norm = item[:80].lower()
        if norm not in seen:
            seen.add(norm)
            deduped.append(item)
    return "\n".join(deduped[:6])[:1600]


def _short_error(exc: Exception) -> str:
    """Короткий тип ошибки без текста запроса/ключей — безопасно показывать пользователю."""
    name = type(exc).__name__
    status = getattr(getattr(exc, "response", None), "status_code", None)
    return f"{name}(status={status})" if status else name


# ---------------------------------------------------------------------------
# v171: Общий бюджет времени ответа шлюза.
#
# Проблема: /v1/chat обходил маршруты ПОСЛЕДОВАТЕЛЬНО — живой поиск (≈4 с),
# Gemini в двух режимах (20 с каждый), дополнительные провайдеры (12 с каждый),
# ZeroGPU и HF Router (6 моделей по 9 с). В худшем случае ответ занимал
# несколько минут, и клиент успевал показать «Фикр мекунам» несколько раз.
#
# Теперь у каждого запроса есть общий дедлайн CHAT_DEADLINE_S. Когда он
# исчерпан, шлюз перестаёт пробовать новые маршруты и честно отвечает, что
# провайдеры не ответили. Пользователь получает ошибку за секунды, а не через
# несколько минут ожидания.
# ---------------------------------------------------------------------------
CHAT_DEADLINE_S = float(os.getenv("ALIYA_CHAT_DEADLINE_S", "100"))
# Сколько времени ещё можно потратить на один конкретный HTTP-вызов.
_PROVIDER_CALL_CAP_S = 20.0


def _deadline_remaining(deadline: Optional[float]) -> float:
    """Сколько секунд осталось до общего дедлайна (0 — если он уже истёк)."""
    if deadline is None:
        return _PROVIDER_CALL_CAP_S
    return max(0.0, deadline - time.monotonic())


def _call_timeout(deadline: Optional[float], requested: float) -> float:
    """Тайм-аут одного вызова: не больше остатка общего бюджета и не меньше 1 с."""
    remaining = _deadline_remaining(deadline)
    if remaining <= 0.5:
        # Дедлайн истёк — вызов делать нельзя. Возвращаем минимальное валидное значение,
        # чтобы httpx никогда не получил бы timeout=0.
        return 1.0
    return max(1.0, min(float(requested), remaining))


def _hf_router_chat(messages: List[Dict[str, Any]], temperature: float, max_tokens: int, deadline: Optional[float] = None) -> Dict[str, Any]:
    """
    Прямой вызов HF Inference Providers через router.huggingface.co.
    В отличие от InferenceClient здесь мы видим HTTP-код КАЖДОЙ попытки и можем
    честно объяснить причину: нет прав у токена, закончились кредиты, модель не обслуживается.
    """
    token = os.getenv("HF_TOKEN", "").strip()
    if not token:
        return {"reply": "", "error": "no_hf_token"}
    attempts: List[Dict[str, Any]] = []
    for model_id in CANDIDATE_CLOUD_MODELS:
        # v171: общий дедлайн — если он истёк, оставшиеся модели не пробуем.
        if _deadline_remaining(deadline) <= 0.5:
            attempts.append({"model": model_id, "error": "deadline_exceeded"})
            break
        try:
            r = httpx.post(
                HF_ROUTER_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "X-Wait-For-Model": "false",
                },
                json={
                    "model": model_id,
                    "messages": messages,
                    "temperature": max(0.05, min(1.2, temperature)),
                    "max_tokens": min(768, max_tokens),
                    "stream": False,
                },
                timeout=_call_timeout(deadline, 9.0),
            )
            if r.status_code == 200:
                data = r.json()
                text = (data.get("choices", [{}])[0].get("message", {}) or {}).get("content") or ""
                text = text.strip()
                if "</think>" in text:
                    text = text.split("</think>", 1)[1].strip()
                if text:
                    return {"reply": text, "model": model_id, "provider": "hf-router", "attempts": attempts}
                attempts.append({"model": model_id, "error": "empty_reply", "status": 200})
            else:
                attempts.append({"model": model_id, "status": r.status_code, "error": _classify_http(r.status_code)})
        except Exception as exc:  # noqa: BLE001
            attempts.append({"model": model_id, "error": _short_error(exc)})
    return {"reply": "", "error": "chat_providers_unavailable", "attempts": attempts}


def _classify_http(status: int) -> str:
    return {
        401: "token_invalid_or_missing_permission",
        402: "insufficient_credits",
        403: "no_access_to_model_or_provider",
        404: "model_not_served_by_any_provider",
        429: "rate_limited",
        503: "provider_unavailable",
    }.get(status, f"http_{status}")


def _extra_provider_chat(
    messages: List[Dict[str, Any]],
    temperature: float,
    max_tokens: int,
    target_lang: str = "",
    deadline: Optional[float] = None,
) -> Dict[str, Any]:
    attempts: List[Dict[str, Any]] = []
    for prov in _select_healthy_providers(for_tajik=(target_lang == "tg")):
        # v171: общий дедлайн — дальше провайдеры не пробуем.
        if _deadline_remaining(deadline) <= 0.5:
            attempts.append({"provider": prov["name"], "error": "deadline_exceeded"})
            break
        try:
            m_low = prov["model"].lower()
            is_reasoning = ("gpt-oss" in m_low) or ("nemotron" in m_low) or ("reasoning" in m_low) or ("qwen3" in m_low)
            eff_max_tokens = max(1024, min(2048, int(max_tokens) * 2)) if is_reasoning else min(1536, max(64, int(max_tokens)))
            body: Dict[str, Any] = {
                "model": prov["model"],
                "messages": messages,
                "temperature": max(0.05, min(1.0, float(temperature))),
                "max_tokens": eff_max_tokens,
            }
            if "gpt-oss" in m_low and "groq.com" in prov["url"]:
                body["reasoning_effort"] = "low"
            r = httpx.post(
                prov["url"],
                headers={"Authorization": f"Bearer {prov['key']}", "Content-Type": "application/json"},
                json=body,
                timeout=_call_timeout(deadline, 12.0),
            )
            _mark_provider_http_status(prov["name"], prov["key"], r.status_code)
            if r.status_code == 200:
                text = (r.json().get("choices", [{}])[0].get("message", {}) or {}).get("content", "")
                text = (text or "").strip()
                if "</think>" in text:
                    text = text.split("</think>", 1)[1].strip()
                text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
                if text:
                    if target_lang == "tg" and _has_uzbek_contamination(text):
                        attempts.append({"provider": prov["name"], "error": "uzbek_language_contamination"})
                        continue
                    return {"reply": text, "model": prov["model"], "provider": prov["name"], "attempts": attempts}
                attempts.append({"provider": prov["name"], "error": "empty_reply"})
            else:
                attempts.append({"provider": prov["name"], "status": r.status_code, "error": _classify_http(r.status_code)})
        except Exception as exc:  # noqa: BLE001
            attempts.append({"provider": prov["name"], "error": _short_error(exc)})
    return {"reply": "", "error": "chat_providers_unavailable", "attempts": attempts}


def provider_diagnostics(deep: bool = False) -> Dict[str, Any]:
    """
    Отчёт о состоянии облачных провайдеров БЕЗ токенов и паролей.
    deep=True делает реальный мини-запрос (1 токен) — это единственный способ
    доказать, что ключ действительно даёт доступ, а не только присутствует.
    """
    now = time.time()
    if not deep and _provider_probe_cache["result"] and now - _provider_probe_cache["at"] < _PROVIDER_PROBE_TTL_SEC:
        cached = dict(_provider_probe_cache["result"])
        cached["cached"] = True
        return cached

    hf_configured = bool(os.getenv("HF_TOKEN", "").strip())
    gemini_configured = bool(os.getenv("GEMINI_API_KEY", "").strip())
    result: Dict[str, Any] = {
        "hf_token_present": hf_configured,
        "gemini_key_present": gemini_configured,
        "extra_providers": len(_extra_openai_providers()),
        "chat_ready": False,
        "checked_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if not deep:
        result["note"] = "Presence of a key is not proof of access. Use /health?deep=1 for a real probe."
        return result

    probe_msgs = [{"role": "user", "content": "ping"}]
    probe: Dict[str, Any] = {}
    if gemini_configured:
        try:
            r = httpx.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY", "").strip()},
                json={"contents": [{"role": "user", "parts": [{"text": "ping"}]}],
                      "generationConfig": {"maxOutputTokens": 8}},
                timeout=10.0,
            )
            probe["gemini"] = {"status": r.status_code, "error": None if r.status_code == 200 else _classify_http(r.status_code)}
        except Exception as exc:  # noqa: BLE001
            probe["gemini"] = {"error": _short_error(exc)}
    if hf_configured:
        hf = _hf_router_chat(probe_msgs, 0.1, 8)
        probe["hf_router"] = {
            "ok": bool(hf.get("reply")),
            "model": hf.get("model"),
            "error": hf.get("error"),
            "attempts": (hf.get("attempts") or [])[:6],
        }
    extra = _extra_provider_chat(probe_msgs, 0.1, 8)
    if _extra_openai_providers():
        probe["extra"] = {"ok": bool(extra.get("reply")), "error": extra.get("error"),
                          "attempts": (extra.get("attempts") or [])[:4]}

    result["probe"] = probe
    result["chat_ready"] = bool(
        probe.get("gemini", {}).get("status") == 200
        or probe.get("hf_router", {}).get("ok")
        or probe.get("extra", {}).get("ok")
    )
    _provider_probe_cache["at"] = now
    _provider_probe_cache["result"] = result
    return result


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    temperature: float = 0.6
    max_tokens: int = 640
    reasoning_mode: str = "medium"  # "normal" | "medium" | "high"
    target_language: str = ""  # Необязательный явный язык для режима переводчика.


class DocumentAnalyzeRequest(BaseModel):
    file_base64: str
    file_name: str
    prompt: str = ""
    system: str = ""
    reasoning_mode: str = "medium"


class DocumentGenerateRequest(BaseModel):
    title: str = "Документ Алии"
    content_markdown: str
    target_format: str = "pdf"  # "pdf" | "docx" | "xlsx"


class DocumentConvertRequest(BaseModel):
    file_base64: str
    file_name: str
    target_format: str = "pdf"  # "pdf" | "docx" | "xlsx"
    instruction: str = ""


class VisionRequest(BaseModel):
    prompt: str
    image_base64: str
    system: str = ""


class ImagePlanRequest(BaseModel):
    prompt: str
    ui_lang: str = "ru"


class ImageRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024
    # v2.7.4: разный seed на каждый запрос — иначе внешний генератор возвращает
    # одну и ту же картинку на одинаковое описание.
    seed: int | None = None
    style: str = ""
    already_planned: bool = False


class TtsRequest(BaseModel):
    text: str
    voice_style: str = "eastern"
    lang: str = "tg"
    voice_name: str = ""
    rate: str = ""
    pitch: str = ""


class SttRequest(BaseModel):
    audio_base64: str
    language: str = "auto"
    fast: bool = False


class InsightsBatchRequest(BaseModel):
    events: List[Dict[str, Any]] = []
    rare_words: List[str] = []


def _get_gh_push_token() -> str:
    return (
        os.getenv("GH_PUSH_TOKEN", "").strip()
        or os.getenv("MODELS_PUSH_TOKEN", "").strip()
        or os.getenv("GITHUB_TOKEN", "").strip()
    )


def _scrub_pii(text: str, max_len: int = 320) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "", text)
    cleaned = re.sub(r"\+?\d[\d\-\s()]{7,}\d", "", cleaned)
    cleaned = re.sub(r"(?i)(парол|password|пин|pin|код|token|ключ)\S*\s*[:=]?\s*\S+", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:max_len]


def _active_search_channels() -> List[str]:
    channels: List[str] = ["wikipedia-tg-ru-en+ddg"]
    if os.getenv("GEMINI_API_KEY", "").strip():
        channels.insert(0, "google-ai-search-grounding")
    if os.getenv("YANDEX_API_KEY", "").strip() and _get_yandex_folder_id():
        channels.insert(0, "yandex-search-v2")
    if os.getenv("TAVILY_API_KEY", "").strip():
        channels.append("tavily-ai-search")
    return channels


def _key_expiry_status() -> Dict[str, Any]:
    """
    Автоматический контроль сроков действия ключей (в частности SAMBANOVA_API_KEY до 09.11.2027).
    За 14 дней до истечения включает предупреждение warning_active = True.
    """
    dushanbe_today = dt.datetime.now(dt.timezone(dt.timedelta(hours=5))).date()
    sambanova_present = bool(os.getenv("SAMBANOVA_API_KEY", "").strip())
    exp_raw = os.getenv("SAMBANOVA_EXPIRES_ON", "2027-11-09").strip()
    try:
        exp_date = dt.date.fromisoformat(exp_raw)
    except ValueError:
        exp_date = dt.date(2027, 11, 9)
    days_left = (exp_date - dushanbe_today).days
    warn = sambanova_present and days_left <= 14
    return {
        "sambanova": {
            "configured": sambanova_present,
            "expires_on": exp_date.isoformat(),
            "days_remaining": days_left,
            "warning_active": warn,
            "renewal_url": "https://cloud.sambanova.ai/apis",
            "message_ru": (
                f"⚠️ Пора за 1 минуту обновить SAMBANOVA_API_KEY (осталось {max(0, days_left)} дн., до {exp_date.strftime('%d.%m.%Y')})!"
                if warn
                else (
                    f"✅ Активен ещё {days_left} дн. (до {exp_date.strftime('%d.%m.%Y')})"
                    if sambanova_present
                    else "Не подключён"
                )
            ),
        }
    }


@router.get("/health")
def health(deep: int = 0, diagnostics: int = 0):
    """
    /health               — публичная проверка готовности облака Алии (без раскрытия сторонних провайдеров).
    /health?deep=1        — реальный мини-запрос к провайдерам (доказывает доступ, а не наличие ключа).
    /health?diagnostics=1 — подробный технический отчёт (без токенов и паролей).
    """
    online_ready = bool(
        os.getenv("GEMINI_API_KEY", "").strip()
        or _extra_openai_providers()
        or os.getenv("HF_TOKEN", "").strip()
        or (_zerogpu_chat_fn is not None)
    )
    base: Dict[str, Any] = {
        "status": "ok",
        "service": "aliya-gateway-v1.0.0",
        "version": "1.0.0",
        "student_model": PRIMARY_ALIYA_HF_MODEL,
        "primary_model": PRIMARY_ALIYA_HF_MODEL,
        "online_ready": online_ready,
        "search_ready": bool(_active_search_channels()),
        "zerogpu_enabled": bool(_zerogpu_chat_fn is not None),
        "features": [
            "aliya-cloud-v1.0.0",
            "realtime-sse-chat-stream",
            "reasoning-modes-normal-medium-high",
            "verified-live-search",
            "document-read-generate-convert-pdf-docx-xlsx-txt",
            "vision-photo-analysis",
            "tts-6-voices",
            "stt-multilingual",
            "aliya-hd-image-badges-aspects",
        ],
    }
    if deep or diagnostics:
        base["provider_diagnostics"] = provider_diagnostics(deep=bool(deep))
        base["key_lifecycle"] = _key_expiry_status()
    return base


@router.get("/v1/models")
def list_models():
    """
    Список провайдеров и моделей, которые шлюз реально попробует использовать,
    в порядке приоритета. Без ключей и внутренних адресов.
    """
    return {
        "chat": {
            "gemini": "gemini-2.5-flash" if os.getenv("GEMINI_API_KEY", "").strip() else None,
            "council_teachers": [p["name"] for p in _extra_openai_providers()],
            "zerogpu_teachers": [ZEROGPU_TEACHER_TAJIK_MODEL, ZEROGPU_TEACHER_LOGIC_MODEL, REASONING_LAYER1_MODEL],
            "student_distillation_target": PRIMARY_ALIYA_HF_MODEL,
            "hf_router_models": CANDIDATE_CLOUD_MODELS if os.getenv("HF_TOKEN", "").strip() else [],
            "extra_providers": [p["name"] for p in _extra_openai_providers()],
        },
        "live_search": _active_search_channels(),
        "vision": {
            "gemini": "gemini-2.5-flash" if os.getenv("GEMINI_API_KEY", "").strip() else None,
            "hf_models": CANDIDATE_VISION_MODELS if os.getenv("HF_TOKEN", "").strip() else [],
            "ocr_fallback": "tesseract (rus+eng+tgk+fas)",
        },
        "image": CANDIDATE_IMAGE_MODELS,
        "tts": sorted(EDGE_VOICE_MAP.keys()),
    }


@router.post("/v1/insights")
async def collect_user_insights(req: InsightsBatchRequest):
    # Temporarily disabled until server-side consent and data governance are implemented.
    return {"ok": False, "error": "insights_temporarily_disabled"}

    """
    Обезличенный суточный канал опыта пользователей из чатов и голосового режима:
    сохраняет очищенные от персональных данных вопросы, типы диалогов и живые/редкие слова
    в дневной файл `user_insights/day_YYYY-MM-DD.jsonl` в закрытом репозитории `sharipovip/aliya-core`
    для Этапа 2 (Supervised Fine-Tuning) единой модели Алия 7B.
    """
    gh_tok = _get_gh_push_token()
    if not gh_tok:
        return {"ok": False, "error": "GH_PUSH_TOKEN not configured"}

    dushanbe_now = dt.datetime.now(dt.timezone(dt.timedelta(hours=5)))
    day_str = dushanbe_now.strftime("%Y-%m-%d")
    rel_path = f"user_insights/day_{day_str}.jsonl"
    api_url = f"https://api.github.com/repos/{INSIGHTS_TARGET_REPO}/contents/{rel_path}"

    new_records: List[Dict[str, Any]] = []
    for ev in (req.events or [])[:120]:
        q_clean = _scrub_pii(str(ev.get("q", "")))
        if len(q_clean) < 3:
            continue
        new_records.append(
            {
                "t": dushanbe_now.strftime("%H:%M"),
                "q": q_clean,
                "lang": str(ev.get("lang", "ru"))[:8],
                "mode": str(ev.get("mode", "chat"))[:16],
                "type": str(ev.get("type", "general"))[:24],
                "behavior": str(ev.get("behavior", "normal"))[:24],
                # Аудит: запись пришла только от пользователя, давшего согласие в приложении.
                "consent": True,
            }
        )

    clean_words = []
    for w in (req.rare_words or [])[:150]:
        cw = re.sub(r"[^а-яёӣқӯҳҷғА-ЯЁӢҚӮҲҶҒa-zA-Z\-]", "", str(w).strip().lower())
        if 3 <= len(cw) <= 32:
            clean_words.append(cw)
    if clean_words:
        new_records.append(
            {
                "t": dushanbe_now.strftime("%H:%M"),
                "kind": "words",
                "words": sorted(set(clean_words)),
            }
        )

    if not new_records:
        return {"ok": True, "saved": 0}

    headers = {
        "Authorization": f"Bearer {gh_tok}",
        "Accept": "application/vnd.github+json",
    }

    async with _insights_lock:
        async with httpx.AsyncClient(timeout=20.0) as hc:
            existing_lines: List[str] = []
            sha = None
            r_get = await hc.get(api_url, params={"ref": INSIGHTS_TARGET_BRANCH}, headers=headers)
            if r_get.status_code == 200:
                meta = r_get.json()
                sha = meta.get("sha")
                raw_b64 = (meta.get("content") or "").replace("\n", "")
                if raw_b64:
                    existing_text = base64.b64decode(raw_b64).decode("utf-8", errors="ignore")
                    existing_lines = [ln for ln in existing_text.splitlines() if ln.strip()]

            # Ограничение безопасности на размер одного дневного файла (~4000 строк)
            merged_lines = existing_lines[-3800:] + [json.dumps(r, ensure_ascii=False) for r in new_records]
            final_bytes = ("\n".join(merged_lines) + "\n").encode("utf-8")

            payload: Dict[str, Any] = {
                "message": f"Дневной опыт пользователей Алии ({day_str}) [skip ci]",
                "content": base64.b64encode(final_bytes).decode("ascii"),
                "branch": INSIGHTS_TARGET_BRANCH,
            }
            if sha:
                payload["sha"] = sha

            r_put = await hc.put(api_url, headers=headers, json=payload)
            if r_put.status_code not in (200, 201):
                return {"ok": False, "status": r_put.status_code}

    return {"ok": True, "saved": len(new_records), "file": rel_path}


def _flush_teacher_lessons_sync(batch: List[Dict[str, Any]], gh_tok: str) -> None:
    if not batch or not gh_tok:
        return
    dushanbe_now = dt.datetime.now(dt.timezone(dt.timedelta(hours=5)))
    day_str = dushanbe_now.strftime("%Y-%m-%d")
    rel_path = f"user_insights/day_{day_str}.jsonl"
    api_url = f"https://api.github.com/repos/{INSIGHTS_TARGET_REPO}/contents/{rel_path}"
    headers = {"Authorization": f"Bearer {gh_tok}", "Accept": "application/vnd.github+json"}
    try:
        existing_lines: List[str] = []
        sha = None
        r_get = httpx.get(api_url, params={"ref": INSIGHTS_TARGET_BRANCH}, headers=headers, timeout=15.0)
        if r_get.status_code == 200:
            meta = r_get.json() or {}
            sha = meta.get("sha")
            raw_b64 = (meta.get("content") or "").replace("\n", "")
            if raw_b64:
                existing_text = base64.b64decode(raw_b64).decode("utf-8", errors="ignore")
                existing_lines = [ln for ln in existing_text.splitlines() if ln.strip()]
        merged_lines = existing_lines[-3800:] + [json.dumps(r, ensure_ascii=False) for r in batch]
        final_bytes = ("\n".join(merged_lines) + "\n").encode("utf-8")
        payload: Dict[str, Any] = {
            "message": f"Дистилляция Совета Учителей в Алия 7B ({day_str}) [skip ci]",
            "content": base64.b64encode(final_bytes).decode("ascii"),
            "branch": INSIGHTS_TARGET_BRANCH,
        }
        if sha:
            payload["sha"] = sha
        httpx.put(api_url, headers=headers, json=payload, timeout=15.0)
    except Exception as exc:
        logging.warning("Teacher distillation flush skipped (%s)", type(exc).__name__)


def _record_teacher_lesson_async(
    user_q: str,
    teacher_reply: str,
    target_lang: str,
    grounded: bool = False,
) -> None:
    """
    Фоновая запись проверенных ответов Совета Учителей и живого поиска в `user_insights/`,
    чтобы модель-ученик `sharipovip/aliya-7b` ежедневно обучалась умным ответам на Kaggle GPU!
    """
    # Requests do not carry verifiable consent: do not collect teacher lessons.
    return

    global _teacher_lessons_last_flush
    gh_tok = _get_gh_push_token()
    if not gh_tok:
        return
    q_clean = _scrub_pii(user_q, max_len=360)
    a_clean = _scrub_pii(teacher_reply, max_len=1200)
    if len(q_clean) < 5 or len(a_clean) < 20:
        return
    dushanbe_now = dt.datetime.now(dt.timezone(dt.timedelta(hours=5)))
    record = {
        "t": dushanbe_now.strftime("%H:%M"),
        "kind": "teacher_distill",
        "q": q_clean,
        "teacher_a": a_clean,
        "lang": target_lang[:8],
        "grounded": bool(grounded),
        "consent": True,
    }
    to_flush: List[Dict[str, Any]] = []
    now_ts = time.time()
    with _teacher_distill_lock:
        _teacher_lessons_buffer.append(record)
        if len(_teacher_lessons_buffer) >= 4 or (now_ts - _teacher_lessons_last_flush) >= 180.0:
            to_flush = list(_teacher_lessons_buffer)
            _teacher_lessons_buffer.clear()
            _teacher_lessons_last_flush = now_ts
    if to_flush:
        threading.Thread(target=_flush_teacher_lessons_sync, args=(to_flush, gh_tok), daemon=True).start()


def _gemini_teacher_chat(
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    enable_google_search: bool,
    reasoning_mode: str = "medium",
    deadline: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Учитель Google AI Studio (`gemini-2.5-flash`) + встроенный Google AI Search Grounding (`google_search`).
    Если суточный лимит живого Google-поиска (500/сутки) исчерпан — мгновенно повторяет запрос без `tools`.
    """
    global _gemini_cooldown_until
    gem_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not gem_key or time.time() < _gemini_cooldown_until:
        return {"reply": ""}
    rmode = (reasoning_mode or "medium").strip().lower()
    systems = [m.get("content", "") for m in messages if m.get("role") == "system"]
    contents = [
        {
            "role": "model" if m.get("role") == "assistant" else "user",
            "parts": [{"text": m.get("content", "")}],
        }
        for m in messages
        if m.get("role") in ("user", "assistant")
    ]
    modes = [True, False] if enable_google_search else [False]
    for use_search_tool in modes:
        # v171: общий дедлайн — второй режим (без поиска) пробуем, только если вақт ҳам қолд.
        if _deadline_remaining(deadline) <= 0.5:
            break
        think_budget = 768 if rmode == "high" else (128 if use_search_tool else 0)
        gen_cfg: Dict[str, Any] = {
            "temperature": max(0.05, min(1.0, float(temperature))),
            "maxOutputTokens": max(1536, min(6144, int(max_tokens) * 3 + think_budget)),
            "thinkingConfig": {"thinkingBudget": think_budget},
        }
        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": gen_cfg,
        }
        if systems:
            payload["systemInstruction"] = {"parts": [{"text": "\n".join(systems)}]}
        if use_search_tool:
            payload["tools"] = [{"google_search": {}}]
        try:
            response = httpx.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                headers={"x-goog-api-key": gem_key},
                json=payload,
                timeout=_call_timeout(deadline, 20.0 if (use_search_tool or rmode == "high") else 12.0),
            )
            if response.status_code != 200:
                if response.status_code == 429 and not use_search_tool:
                    _gemini_cooldown_until = time.time() + 90.0
                if use_search_tool:
                    continue
                response.raise_for_status()
            cand = (response.json().get("candidates") or [{}])[0]
            parts = (cand.get("content") or {}).get("parts") or []
            text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
            if text:
                grounded = bool(cand.get("groundingMetadata")) or use_search_tool
                return {
                    "reply": text,
                    "model": "aliya-cloud",
                    "provider": "aliya-cloud",
                    "grounded": grounded,
                }
        except Exception as exc:
            if use_search_tool:
                continue
            logging.warning("Gemini teacher unavailable (%s)", type(exc).__name__)
    return {"reply": ""}


@router.post("/v1/chat")
def chat(req: ChatRequest):
    rmode = (req.reasoning_mode or "medium").strip().lower()
    target_lang, explicit_lang = _resolve_effective_chat_lang(req.messages)
    if req.target_language in ("tg", "ru", "en", "fa"):
        target_lang, explicit_lang = req.target_language, True
    last_user_q = next(
        (str(m.get("content") or "") for m in reversed(req.messages) if m.get("role") == "user"),
        "",
    )
    # 0. Жёсткая пред-ИИ защита от 18+ / наготы / CSAM ДО обращения к любой модели
    safety_hit = check_nsfw_safety(last_user_q, req.messages[:-1], is_image_context=False)
    if safety_hit is not None:
        return {
            "reply": safety_hit["message"],
            "model": "aliya-safety",
            "provider": "aliya-safety",
            "blocked": True,
        }

    concise_voice = int(req.max_tokens) <= 160
    eff_max_tokens = req.max_tokens
    if not concise_voice:
        if rmode == "normal":
            eff_max_tokens = max(int(req.max_tokens), 640)
        elif rmode == "high":
            eff_max_tokens = max(int(req.max_tokens), 1800)
        else:
            eff_max_tokens = max(int(req.max_tokens), 1024)

    want_live_search = _needs_live_search(last_user_q) or (
        rmode == "high" and len(last_user_q.strip()) >= 14 and not _GREETING_SKIP_RE.match(last_user_q)
    )
    # v171: общий дедлайн ответа — весь цепочка fallback-маршрутов обязана уложиться в него.
    deadline = time.monotonic() + CHAT_DEADLINE_S
    search_context = _gather_live_search_context(last_user_q, target_lang) if want_live_search else ""
    aligned_messages = _prepare_language_aligned_messages(
        req.messages,
        target_lang,
        explicit_lang,
        search_context=search_context,
        concise_voice=concise_voice,
        reasoning_mode=rmode,
    )

    # 1. Учитель №1: облачный аналитический канал с живым поиском
    if os.getenv("GEMINI_API_KEY", "").strip():
        gem_res = _gemini_teacher_chat(
            aligned_messages,
            req.temperature,
            eff_max_tokens,
            enable_google_search=want_live_search,
            reasoning_mode=rmode,
            deadline=deadline,
        )
        if gem_res.get("reply"):
            clean_reply = _sanitize_llm_reply(gem_res["reply"], target_lang)
            if not (target_lang == "tg" and _has_uzbek_contamination(clean_reply)):
                _record_teacher_lesson_async(
                    last_user_q, clean_reply, target_lang, grounded=bool(gem_res.get("grounded") or search_context)
                )
                return {
                    "reply": clean_reply,
                    "model": "aliya-cloud",
                    "provider": "aliya-cloud",
                }

    # 2. Совет Гигантских Внешних Учителей
    extra_result: Dict[str, Any] = {"attempts": []}
    if _extra_openai_providers() and _deadline_remaining(deadline) > 0.5:
        extra_result = _extra_provider_chat(
            aligned_messages, req.temperature, eff_max_tokens, target_lang=target_lang, deadline=deadline
        )
        if extra_result.get("reply"):
            clean_reply = _sanitize_llm_reply(extra_result["reply"], target_lang)
            _record_teacher_lesson_async(last_user_q, clean_reply, target_lang, grounded=bool(search_context))
            return {
                "reply": clean_reply,
                "model": extra_result.get("model"),
                "provider": extra_result.get("provider"),
            }

    # 3. Встроенный Совет Учителей на бесплатной GPU вашего Space (ZeroGPU: Gemma-3-27B + Qwen3-14B)
    if _zerogpu_chat_fn is not None and _deadline_remaining(deadline) > 0.5:
        try:
            zg_msgs = aligned_messages if search_context else req.messages
            zg = _zerogpu_chat_fn(zg_msgs, req.temperature, eff_max_tokens)
            if zg.get("reply"):
                clean_reply = _sanitize_llm_reply(zg["reply"], target_lang)
                _record_teacher_lesson_async(last_user_q, clean_reply, target_lang, grounded=bool(search_context))
                return {
                    "reply": clean_reply,
                    "model": zg.get("model"),
                    "provider": zg.get("provider", "aliya-zerogpu"),
                }
        except Exception as exc:
            logging.warning("ZeroGPU Teacher Council fallback (%s)", type(exc).__name__)

    # 4. HF Inference Providers через router.huggingface.co (резервный канал)
    hf_result = _hf_router_chat(aligned_messages, req.temperature, eff_max_tokens, deadline=deadline)
    if hf_result.get("reply"):
        clean_reply = _sanitize_llm_reply(hf_result["reply"], target_lang)
        _record_teacher_lesson_async(last_user_q, clean_reply, target_lang, grounded=bool(search_context))
        return {
            "reply": clean_reply,
            "model": hf_result.get("model"),
            "provider": hf_result.get("provider", "hf-router"),
        }

    attempts = (hf_result.get("attempts") or []) + (extra_result.get("attempts") or [])
    if not os.getenv("HF_TOKEN", "").strip() and not _extra_openai_providers() and not os.getenv("GEMINI_API_KEY", "").strip():
        return {
            "reply": "",
            "error": "no_chat_provider_configured",
            "diagnostics": {"attempts": attempts},
        }
    logging.warning("All chat providers unavailable: %s", attempts[:6])
    # v171: если дедлайн исчерпан, честно сообщаем об этом — клиент покажет понятную ошибку,
    # а не будет бесконечно ждать.
    expired = _deadline_remaining(deadline) <= 0.5
    return {
        "reply": "",
        "error": "chat_deadline_exceeded" if expired else "chat_providers_unavailable",
        "diagnostics": {"attempts": attempts[:8], "deadline_s": CHAT_DEADLINE_S},
    }


@router.post("/v1/chat/stream")
def chat_stream(req: ChatRequest):
    """
    Потоковый канал реального времени (SSE `text/event-stream`):
      - мгновенно сообщает этап работы (`searching` / `deep_analysis` / `council`);
      - при поддержке провайдера передаёт части текста по мере получения; скорость зависит от сети и модели;
      - в конце отправляет финальное событие `done: true` с очищенным ответом.
    """
    def _event_gen():
        rmode = (req.reasoning_mode or "medium").strip().lower()
        target_lang, explicit_lang = _resolve_effective_chat_lang(req.messages)
        if req.target_language in ("tg", "ru", "en", "fa"):
            target_lang, explicit_lang = req.target_language, True
        last_user_q = next(
            (str(m.get("content") or "") for m in reversed(req.messages) if m.get("role") == "user"),
            "",
        )
        # 0. Жёсткая пред-ИИ защита от 18+ / наготы / CSAM ДО обращения к любой модели
        safety_hit = check_nsfw_safety(last_user_q, req.messages[:-1], is_image_context=False)
        if safety_hit is not None:
            refusal = safety_hit["message"]
            yield f"data: {json.dumps({'type': 'delta', 'delta': refusal}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'done': True, 'reply': refusal, 'model': 'aliya-safety', 'provider': 'aliya-safety', 'blocked': True}, ensure_ascii=False)}\n\n"
            return

        concise_voice = int(req.max_tokens) <= 160
        eff_max_tokens = max(int(req.max_tokens), 640) if (not concise_voice and rmode == "normal") else (
            max(int(req.max_tokens), 1800) if (not concise_voice and rmode == "high") else (
                max(int(req.max_tokens), 1024) if not concise_voice else int(req.max_tokens)
            )
        )

        yield f"data: {json.dumps({'type': 'stage', 'stage': 'deep_analysis' if rmode == 'high' else 'searching'}, ensure_ascii=False)}\n\n"

        want_live_search = _needs_live_search(last_user_q) or (
            rmode == "high" and len(last_user_q.strip()) >= 14 and not _GREETING_SKIP_RE.match(last_user_q)
        )
        # v171: общий дедлайн и для потокового канала.
        deadline = time.monotonic() + CHAT_DEADLINE_S
        search_context = _gather_live_search_context(last_user_q, target_lang) if want_live_search else ""
        aligned_messages = _prepare_language_aligned_messages(
            req.messages,
            target_lang,
            explicit_lang,
            search_context=search_context,
            concise_voice=concise_voice,
            reasoning_mode=rmode,
        )

        # Попытка 1: Потоковый Gemini 2.5 Flash (с авто-резервом и 90-сек защитой от повторных 429)
        global _gemini_cooldown_until
        gem_key = os.getenv("GEMINI_API_KEY", "").strip()
        if gem_key and time.time() >= _gemini_cooldown_until:
            systems = [m.get("content", "") for m in aligned_messages if m.get("role") == "system"]
            contents = [
                {
                    "role": "model" if m.get("role") == "assistant" else "user",
                    "parts": [{"text": m.get("content", "")}],
                }
                for m in aligned_messages
                if m.get("role") in ("user", "assistant")
            ]
            think_budget = 512 if rmode == "high" else (128 if want_live_search else 0)
            search_modes = [True, False] if want_live_search else [False]
            for use_search_tool in search_modes:
                # v171: если общий дедлайн исчерпан — второй режим уже не пробуем.
                if _deadline_remaining(deadline) <= 0.5:
                    break
                payload: Dict[str, Any] = {
                    "contents": contents,
                    "generationConfig": {
                        "temperature": max(0.05, min(1.0, float(req.temperature))),
                        "maxOutputTokens": max(1536, min(6144, eff_max_tokens * 3 + think_budget)),
                        "thinkingConfig": {"thinkingBudget": think_budget},
                    },
                }
                if systems:
                    payload["systemInstruction"] = {"parts": [{"text": "\n".join(systems)}]}
                if use_search_tool:
                    payload["tools"] = [{"google_search": {}}]
                try:
                    acc: List[str] = []
                    in_fence = False
                    with httpx.stream(
                        "POST",
                        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
                        headers={"x-goog-api-key": gem_key},
                        json=payload,
                        timeout=_call_timeout(deadline, 22.0),
                    ) as sr:
                        if sr.status_code != 200:
                            if sr.status_code == 429 and not use_search_tool:
                                _gemini_cooldown_until = time.time() + 90.0
                            continue
                        for raw_line in sr.iter_lines():
                            if not raw_line or not raw_line.startswith("data:"):
                                continue
                            data_str = raw_line[5:].strip()
                            if not data_str or data_str == "[DONE]":
                                continue
                            try:
                                obj = json.loads(data_str)
                                cand = (obj.get("candidates") or [{}])[0]
                                parts = (cand.get("content") or {}).get("parts") or []
                                piece = "".join(p.get("text", "") for p in parts if not p.get("thought"))
                                if piece:
                                    if piece.count("```") % 2 == 1:
                                        in_fence = not in_fence
                                    safe_piece = piece if (in_fence or "```" in piece) else _THIRD_PARTY_BRAND_RE.sub(
                                        "Алия" if target_lang in ("ru", "tg") else "Aliya", piece
                                    )
                                    acc.append(safe_piece)
                                    yield f"data: {json.dumps({'type': 'delta', 'delta': safe_piece}, ensure_ascii=False)}\n\n"
                            except Exception:
                                continue
                    full_gem = _sanitize_llm_reply("".join(acc), target_lang)
                    if full_gem and not (target_lang == "tg" and _has_uzbek_contamination(full_gem)):
                        _record_teacher_lesson_async(last_user_q, full_gem, target_lang, grounded=bool(want_live_search))
                        yield f"data: {json.dumps({'type': 'done', 'done': True, 'reply': full_gem, 'model': 'aliya-cloud', 'provider': 'aliya-cloud'}, ensure_ascii=False)}\n\n"
                        return
                except Exception as exc:
                    logging.warning("Gemini SSE stream fallback (%s)", type(exc).__name__)

        # Попытка 2: Потоковый Совет Внешних Учителей (автоматически пропускает мёртвые 404/402 модели!)
        yield f"data: {json.dumps({'type': 'stage', 'stage': 'council'}, ensure_ascii=False)}\n\n"
        for prov in _select_healthy_providers(for_tajik=(target_lang == "tg")):
            # v171: общий дедлайн — оставшихся провайдеров не пробуем.
            if _deadline_remaining(deadline) <= 0.5:
                break
            try:
                m_low = prov["model"].lower()
                is_reasoning = ("gpt-oss" in m_low) or ("nemotron" in m_low) or ("reasoning" in m_low) or ("qwen3" in m_low)
                body: Dict[str, Any] = {
                    "model": prov["model"],
                    "messages": aligned_messages,
                    "temperature": max(0.05, min(1.0, float(req.temperature))),
                    "max_tokens": max(1536, min(3072, eff_max_tokens * 2)) if is_reasoning else min(2400, max(96, eff_max_tokens)),
                    "stream": True,
                }
                if "gpt-oss" in m_low and "groq.com" in prov["url"]:
                    body["reasoning_effort"] = "low"
                acc_oai: List[str] = []
                think_buf = ""
                in_think = False
                in_fence_oai = False
                # Для таджикского языка сначала накапливаем короткий буфер, чтобы отсеять узбекское смешение до выдачи в чат.
                tg_guard_released = (target_lang != "tg")
                with httpx.stream(
                    "POST",
                    prov["url"],
                    headers={"Authorization": f"Bearer {prov['key']}", "Content-Type": "application/json"},
                    json=body,
                    timeout=_call_timeout(deadline, 16.0),
                ) as sr:
                    _mark_provider_http_status(prov["name"], prov["key"], sr.status_code)
                    if sr.status_code != 200:
                        continue
                    aborted_uzbek = False
                    for raw_line in sr.iter_lines():
                        if not raw_line or not raw_line.startswith("data:"):
                            continue
                        data_str = raw_line[5:].strip()
                        if not data_str or data_str == "[DONE]":
                            break
                        try:
                            obj = json.loads(data_str)
                            delta = ((obj.get("choices") or [{}])[0].get("delta") or {}).get("content") or ""
                            if not delta:
                                continue
                            # Надёжное потоковое вырезание <think>...</think> даже если тег разбит между чанками
                            think_buf += delta
                            if in_think:
                                if "</think>" in think_buf:
                                    in_think = False
                                    think_buf = think_buf.split("</think>", 1)[1]
                                else:
                                    # Оставляем только хвост на случай частичного </think>
                                    think_buf = think_buf[-10:]
                                    continue
                            if "<think>" in think_buf:
                                before_t, after_t = think_buf.split("<think>", 1)
                                if "</think>" in after_t:
                                    delta = before_t + after_t.split("</think>", 1)[1]
                                    think_buf = ""
                                else:
                                    in_think = True
                                    delta = before_t
                                    think_buf = after_t[-10:]
                                    if not delta:
                                        continue
                            elif any("<think>".startswith(think_buf[-k:]) for k in range(1, min(7, len(think_buf) + 1))):
                                continue
                            else:
                                delta = think_buf
                                think_buf = ""
                            if not delta:
                                continue
                            if delta.count("```") % 2 == 1:
                                in_fence_oai = not in_fence_oai
                            safe_delta = delta if (in_fence_oai or "```" in delta) else _THIRD_PARTY_BRAND_RE.sub(
                                "Алия" if target_lang in ("ru", "tg") else "Aliya", delta
                            )
                            acc_oai.append(safe_delta)
                            if not tg_guard_released:
                                joined_so_far = "".join(acc_oai)
                                if _has_uzbek_contamination(joined_so_far):
                                    aborted_uzbek = True
                                    break
                                if len(joined_so_far) >= 160:
                                    tg_guard_released = True
                                    yield f"data: {json.dumps({'type': 'delta', 'delta': joined_so_far}, ensure_ascii=False)}\n\n"
                            else:
                                yield f"data: {json.dumps({'type': 'delta', 'delta': safe_delta}, ensure_ascii=False)}\n\n"
                        except Exception:
                            continue
                    if think_buf and not in_think and not aborted_uzbek:
                        tail_delta = think_buf if in_fence_oai else _THIRD_PARTY_BRAND_RE.sub(
                            "Алия" if target_lang in ("ru", "tg") else "Aliya", think_buf
                        )
                        acc_oai.append(tail_delta)
                        if tg_guard_released:
                            yield f"data: {json.dumps({'type': 'delta', 'delta': tail_delta}, ensure_ascii=False)}\n\n"
                        think_buf = ""
                    if aborted_uzbek:
                        continue
                full_oai = _sanitize_llm_reply("".join(acc_oai), target_lang)
                if full_oai and not (target_lang == "tg" and _has_uzbek_contamination(full_oai)):
                    if not tg_guard_released:
                        yield f"data: {json.dumps({'type': 'delta', 'delta': full_oai}, ensure_ascii=False)}\n\n"
                    _record_teacher_lesson_async(last_user_q, full_oai, target_lang, grounded=bool(search_context))
                    yield f"data: {json.dumps({'type': 'done', 'done': True, 'reply': full_oai, 'model': 'aliya-cloud', 'provider': 'aliya-cloud'}, ensure_ascii=False)}\n\n"
                    return
            except Exception:
                continue

        # Попытка 3: Надёжный синхронный резерв (ZeroGPU / не-стриминговый вызов)
        sync_res = chat(req)
        if sync_res.get("reply"):
            yield f"data: {json.dumps({'type': 'delta', 'delta': sync_res['reply']}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'done': True, 'reply': sync_res['reply'], 'model': sync_res.get('model'), 'provider': sync_res.get('provider')}, ensure_ascii=False)}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'done', 'done': True, 'reply': '', 'error': sync_res.get('error', 'chat_providers_unavailable')}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _legacy_hf_client_chat(req: "ChatRequest") -> Dict[str, Any]:
    """Старый путь через InferenceClient — оставлен как справка, не используется."""
    hf_tok = os.getenv("HF_TOKEN", "").strip()
    if not hf_tok:
        return {"reply": "", "error": "no_chat_provider_configured"}
    client = InferenceClient(api_key=hf_tok, timeout=7)
    for model_id in CANDIDATE_CLOUD_MODELS:
        try:
            out = client.chat.completions.create(
                model=model_id, messages=req.messages,
                temperature=max(0.05, min(1.2, req.temperature)),
                max_tokens=min(768, req.max_tokens))
            text = (out.choices[0].message.content or "").strip()
            if "</think>" in text:
                text = text.split("</think>", 1)[1].strip()
            if text:
                return {"reply": text, "model": model_id}
        except Exception as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            logging.warning("Chat model unavailable: %s status=%s type=%s", model_id, status, type(exc).__name__)
    return {"reply": "", "error": "chat_providers_unavailable"}


@router.post("/v1/vision")
def analyze_photo(req: VisionRequest):
    hf_tok = os.getenv("HF_TOKEN", "").strip()
    if not req.image_base64 or len(req.image_base64) > 12_000_000:
        return {"reply": "", "error": "invalid_image"}

    data_uri = f"data:image/jpeg;base64,{req.image_base64.strip()}"
    user_prompt = (req.prompt or "Опиши подробно это фото и помоги по его содержимому.").strip()
    msgs = []
    if req.system:
        msgs.append({"role": "system", "content": req.system})
    msgs.append(
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_uri}},
                {"type": "text", "text": user_prompt},
            ],
        }
    )

    # 0. Мультимодальное зрение на бесплатной GPU Space (ZeroGPU Qwen2.5-VL-3B-Instruct)
    if _zerogpu_vision_fn is not None:
        try:
            raw_img = base64.b64decode(req.image_base64.strip(), validate=True)
            zg_v = _zerogpu_vision_fn(raw_img, req.system, user_prompt)
            if zg_v.get("reply"):
                return zg_v
        except Exception as exc:
            logging.warning("ZeroGPU vision fallback (%s)", type(exc).__name__)

    # Existing optional Gemini key can also handle multimodal questions.
    gem_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gem_key:
        try:
            payload = {"contents": [{"role": "user", "parts": [
                {"text": (req.system + "\n" + user_prompt).strip()},
                {"inline_data": {"mime_type": "image/jpeg", "data": req.image_base64.strip()}}
            ]}], "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024}}
            response = httpx.post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                headers={"x-goog-api-key": gem_key}, json=payload, timeout=20.0)
            response.raise_for_status()
            parts = response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts).strip()
            if text:
                return {"reply": _sanitize_llm_reply(text, "ru"), "model": "aliya-vision"}
        except Exception as exc:
            logging.warning("Gemini vision failed (%s)", type(exc).__name__)

    client = InferenceClient(api_key=hf_tok, timeout=10) if hf_tok else None
    for v_model in CANDIDATE_VISION_MODELS if client else []:
        try:
            out = client.chat.completions.create(
                model=v_model,
                messages=msgs,
                temperature=0.35,
                max_tokens=640,
            )
            text = (out.choices[0].message.content or "").strip()
            if text:
                return {"reply": _sanitize_llm_reply(text, "ru"), "model": "aliya-vision"}
        except Exception as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            logging.warning("Vision model unavailable: %s status=%s type=%s", v_model, status, type(exc).__name__)
            continue

    # OCR is a fallback for reading text, not an image-description model.
    try:
        raw = base64.b64decode(req.image_base64, validate=True)
        if len(raw) > 8_000_000:
            return {"reply": "", "error": "image_too_large"}
        from PIL import Image
        with Image.open(io.BytesIO(raw)) as image:
            image.verify()
        with tempfile.NamedTemporaryFile(suffix=".jpg") as image_file:
            image_file.write(raw)
            image_file.flush()
            result = subprocess.run(["tesseract", image_file.name, "stdout", "-l", "rus+eng+tgk+fas", "--psm", "3"],
                capture_output=True, text=True, timeout=25, check=True)
        extracted = result.stdout.strip()
        if len(extracted) >= 4:
            return {"reply": "Распознанный текст на изображении (проверьте возможные ошибки):\n\n" + extracted,
                    "model": "local-ocr", "partial": True}
    except Exception as exc:
        logging.warning("OCR fallback unavailable (%s)", type(exc).__name__)
    return {"reply": "", "error": "vision_providers_unavailable"}


# ==============================================================================
# ГИБРИДНЫЙ МОРФОЛОГИЧЕСКИЙ ПЕРЕВОДЧИК ПРОМПТОВ (ТАДЖИКСКИЙ + РУССКИЙ -> ENGLISH)
# + КАТЕГОРИЙНАЯ ЗАЩИТА SDXL ОТ ПОЯВЛЕНИЯ СЛУЧАЙНЫХ ЛЮДЕЙ/ЖЕНЩИН НА ФОТО
# ==============================================================================
_FOLD_TJ_RU = str.maketrans({
    "ё": "е", "ӣ": "и", "ӯ": "у", "қ": "к", "ҳ": "х", "ҷ": "ч", "ғ": "г", "ъ": "", "’": "", "'": ""
})


def _fold_word(w: str) -> str:
    return w.lower().translate(_FOLD_TJ_RU)


_DRAW_NOISE_WORDS = {
    "нарисуй", "нарисовать", "нарисуйте", "создай", "создать", "создайте", "сгенерируй", "сгенерировать",
    "сделай", "сделайте", "покажи", "покажите", "подготовь", "подготов", "подготовьте", "приготовь",
    "бикаш", "бикашед", "каш", "кашед", "бисоз", "бисозед", "соз", "созед", "омода", "намо", "намоед", "тайер",
    "фото", "фотку", "фотки", "фотографию", "фотография", "картинку", "картинка", "картинки",
    "изображение", "рисунок", "расм", "расми", "расмро", "расмхо", "сурат", "сурати", "суратро", "суратхо",
    "акс", "акси", "аксро", "тасвир", "тасвири", "тасвирро", "мне", "пожалуйста", "пожалуста", "плиз", "алия",
    "алие", "теперь", "сейчас", "давай", "еще", "другое", "другую", "другой", "одно", "одну", "один",
    "ба", "ма", "ман", "барои", "як", "якто", "боз", "акнун", "дигар", "лутфан", "мехохам", "кун", "кунед",
    "draw", "paint", "create", "generate", "make", "prepare", "photo", "picture", "image", "please", "another",
}

_VISUAL_VOCAB_RAW = """
dog|animal|собак*,пес,пса,псы|саг
puppy|animal|щенок,щенк*,щенят*|сагбача
cat|animal|кошк*,кошек,кот,кота,коту,котом,коты,котов,котик*,кошечк*|гурба
kitten|animal|котен*,котят*|гурбача
horse|animal|лошад*,конь,коня,коню,конем,кони,коней,жереб*|асп
cow|animal|коров*|гов
bull|animal|бык,быка,быки|-
sheep|animal|овц*,овечк*,баран*|гусфанд
goat|animal|коза,козу,козы,козел,козла,козл*|буз
camel|animal|верблюд*|шутур
donkey|animal|осел,осла,ослы|хар
lion|animal|лев,льва,льву,львом,львы,львов,львиц*|шер
tiger|animal|тигр*,тигриц*|бабр
snow leopard|animal|барс*,ирбис*|паланги барфи
leopard|animal|леопард*,пантер*|паланг
bear|animal|медвед*,мишк*,медвеж*|хирс
wolf|animal|волк*,волч*|гург
fox|animal|лис,лиса,лису,лисы,лисиц*|рубох
rabbit|animal|кролик*,зайц*,заяц,зайчик*|харгуш
elephant|animal|слон*|фил
monkey|animal|обезьян*|маймун
deer|animal|олен*|оху
eagle|animal|орел,орла,орлы,орлов|укоб,бургут
owl|animal|сова,сову,совы,филин*|бум
parrot|animal|попуга*|тути
peacock|animal|павлин*|товус
dove|animal|голуб*|кабутар,кафтар
chicken|animal|куриц*,цыпл*|мург
rooster|animal|петух*|хурус
duck|animal|утка,утку,утки,уток|мургоби
bird|animal|птиц*,птичк*|парранда,паранда
fish|animal|рыба,рыбу,рыбы,рыбк*|мохи
dolphin|animal|дельфин*|делфин
shark|animal|акул*|наханг
turtle|animal|черепах*|сангпушт
butterfly|animal|бабочк*|парвона
snake|animal|змея,змею,змеи|мор
panda|animal|панд*|панда
mountains|nature|горы,гор,горах,горами,горн*|кухистон,куххо
mountain|nature|гора,гору,горе,вершин*|кух
Pamir mountains|nature|памир*|помир
river|nature|река,реку,реки,речк*|даре
lake|nature|озер*|кул
Iskanderkul mountain lake|nature|искандеркул*,искандаркул*|искандаркул
sea|nature|море,моря,морю,морем,морск*|бахр
ocean|nature|океан*|укенус
waterfall|nature|водопад*|обшор
forest|nature|лес,леса,лесу,лесом,лесн*|чангал,беша
evergreen spruce fir pine tree|nature|елка,елку,елки,елоч*,ель,ели,сосн*,пихт*,кедр*,хвойн*|арча,санавбар
plane sycamore tree|nature|чинар*|чинор
birch tree|nature|берез*|тусс
oak tree|nature|дуб,дуба,дубов*|булут
weeping willow tree|nature|ива,ивы,иву|бед,мачнунбед
palm tree|nature|пальм*|нахл
apple tree with ripe apples|nature|яблон*|себзор
tree|nature|дерев*|дарахт
flowers|nature|цветы,цветов,цветам,цветами|гулхо
flower|nature|цветок,цветка,цветку,роза,розу,розы,тюльпан*|гул,садбарг,лола
garden|nature|сад,сада,саду|бог
meadow|nature|поле,поля,луг,луга|маргзор,сабзазор
green grass|nature|трав*,газон*|алаф,сабза
sunset|nature|закат*|гуруб
sunrise|nature|рассвет*,восход*|тулуи офтоб
sky|nature|небо,неба,небе|осмон
clouds|nature|облак*,туча,тучи|абр,абрхо
snow|nature|снег*,снеж*|барф
rain|nature|дожд*|борон
sun|nature|солнц*|офтоб,хуршед
moon|nature|луна,луну,луны|мох
stars|nature|звезд*|ситора,ситорахо
desert|nature|пустын*|биебон,сахро
winter|nature|зима,зиму,зимой,зимн*|зимистон
spring|nature|весн*,весенн*|бахор
summer|nature|лето,летом,летн*|тобистон
autumn|nature|осень,осенью,осенн*|тирамох
a house|place|дом,дома,дому,домом,домик*|хона
city|place|город*|шахр
Dushanbe city architecture|place|душанбе|душанбе
Khujand city|place|худжанд*,ходжент*|хучанд
Samarkand Registan|place|самарканд*|самарканд
Bukhara architecture|place|бухар*|бухоро
Tajikistan landscape|place|таджикистан*|точикистон
village|place|деревн*,село,кишлак*|деха,кишлок
mosque|place|мечет*|масчид
palace|place|дворец,дворц*|каср
castle|place|замок,замка,крепост*|калъа
bridge|place|мост,моста|пул,купрук
road|place|дорога,дорогу,дороги,трасс*|рох
street|place|улиц*|куча
bazaar market|place|базар*,рынок,рынка|бозор
school|place|школ*|мактаб
park|place|парк*|боги фарханги
plov Central Asian rice pilaf with meat and carrots|food|плов*|палав,оши палав
traditional round Central Asian flatbread non|food|лепешк*|нон,кулча
samsa baked savory pastries|food|самс*|самбуса
manti steamed dumplings|food|манты,мант*|манту
shish kebab skewers|food|шашлык*,кебаб*|кабоб,сихкабоб
apple|food|яблок*|себ
pomegranate|food|гранат,граната,гранаты|анор,анар
cherry|food|вишн*,черешн*|гелос,олуча
walnut|food|орех*,грецк*|чормагз
lemon|food|лимон*|лиму
watermelon|food|арбуз*|тарбуз
melon|food|дыня,дыню,дыни|харбуза
grapes|food|виноград*|ангур
apricots|food|абрикос*|зардолу
peaches|food|персик*|шафтолу
tea in traditional bowl|food|чай,чая,чаю|чой
cake|food|торт*,пирожн*|торт
pizza|food|пицц*|питса
car|vehicle|машин*,автомобил*,авто,тачк*|мошин,автомобил
sports car|vehicle|спорткар*|мошини варзиши
airplane|vehicle|самолет*|хавопаймо
helicopter|vehicle|вертолет*|чархбол
train|vehicle|поезд*|катора
ship|vehicle|корабл*,яхт*,лодк*|кишти,заврак
bicycle|vehicle|велосипед*|велосипед
motorcycle|vehicle|мотоцикл*|мотосикл
robot|object|робот*|робот
book|object|книг*,книжк*|китоб
phone|object|телефон*,смартфон*|телефон
laptop computer|object|компьютер*,ноутбук*|компютер
table|object|стол,стола,столе|миз
chair|object|стул*,кресл*|курси
carpet|object|ковер,ковра,ковре|колин
clock|object|часы,часов|соат
school building|place|школ*|мактаб
university building|place|университет*,институт*|донишгох
mosque|place|мечет*|масчид
hospital building|place|больниц*,поликлиник*|беморхона
building architecture|place|здани*,постройк*|бино
courtyard|place|двор*|сахн,хавли
exterior outside view|adj|снаруж*,наружн*,внешн*|берун,беруна
in Tajikistan|place|таджикистан*|точикистон
man|person|мужчин*,мужик*,парен*,парня|мард,чавон
woman|person|женщин*|зан
young woman|person|девушк*|духтар
little girl|person|девочк*|духтарак
boy|person|мальчик*,пацан*|писар,писарак
child|person|ребен*,дети,детей,малыш*|кудак
old man|person|старик*,дедушк*|муйсафед,бобо
old woman|person|бабушк*,старуш*|пиразан,модаркалон
doctor|person|врач*,доктор*|духтур,табиб
astronaut|person|космонавт*|кайхоннавард
red|adj|красн*,алый|сурх
white|adj|белый,белая,белое,белую,белые,белого,белом|сафед
black|adj|черный,черная,черное,черную,черные,черного|сиех
ginger orange|adj|рыж*|малла,норинчи
golden|adj|золот*|тиллои,заррин
yellow|adj|желт*|зард
green|adj|зелен*|сабз
blue|adj|син*,голуб*|кабуд,оби
big|adj|больш*,огромн*,крупн*|калон,бузург
small cute|adj|маленьк*,милый,милая,милое,милую,красив*|хурд,зебо,хушруй
running|adj|бегущ*,бежит|медавад
sleeping|adj|спящ*,спит|хобида
on|prep|на|дар болои,руи
in|prep|в,во|дар
under|prep|под|зери
near|prep|у,около,возле,рядом|назди
with|prep|с,со|бо
and|prep|и|ва,у
"""

_EXACT_VOCAB: Dict[str, Tuple[str, str, str]] = {}
_STEM_VOCAB: List[Tuple[str, str, str, str]] = []
_TAJIK_WORD_HINTS: set = {
    "саг", "гурба", "асп", "гов", "гусфанд", "шер", "паланг", "хирс", "гург", "рубох",
    "мохи", "паранда", "парранда", "кух", "куххо", "даре", "бахр", "гул", "дарахт",
    "хона", "шахр", "мошин", "палав", "нон", "самбуса", "осмон", "барф", "борон",
    "калон", "хурд", "сафед", "сиех", "сурх", "сабз", "зард", "кабуд", "зебо",
    "расм", "расми", "сурат", "сурати", "акс", "акси", "бикаш", "бисоз", "дар", "бо", "ва",
}

for _line in _VISUAL_VOCAB_RAW.strip().splitlines():
    _parts = [p.strip() for p in _line.split("|")]
    if len(_parts) != 4:
        continue
    _en, _kind, _ru_forms, _tg_forms = _parts
    for _lang_tag, _forms in (("ru", _ru_forms), ("tg", _tg_forms)):
        if _forms == "-":
            continue
        for _item in _forms.split(","):
            _item_f = _fold_word(_item.strip())
            if not _item_f:
                continue
            if _item_f.endswith("*"):
                _STEM_VOCAB.append((_item_f[:-1], _en, _kind, _lang_tag))
            else:
                _EXACT_VOCAB[_item_f] = (_en, _kind, _lang_tag)

_STEM_VOCAB.sort(key=lambda x: len(x[0]), reverse=True)
_TG_ENDINGS = ("хои", "хо", "ро", "ам", "ат", "аш", "и")


def _lookup_visual_token(raw_word: str) -> Optional[Tuple[str, str, bool]]:
    folded = _fold_word(raw_word)
    if not folded:
        return None
    if folded in _EXACT_VOCAB:
        en, kind, _ = _EXACT_VOCAB[folded]
        return en, kind, False
    for suf in _TG_ENDINGS:
        if len(folded) > len(suf) + 1 and folded.endswith(suf):
            base = folded[:-len(suf)]
            if base in _EXACT_VOCAB and _EXACT_VOCAB[base][2] == "tg":
                en, kind, _ = _EXACT_VOCAB[base]
                if suf in ("хо", "хои") and not en.endswith("s") and kind in ("animal", "object", "vehicle"):
                    en = en + "s"
                return en, kind, (suf == "и")
    for stem, en, kind, _ in _STEM_VOCAB:
        if folded.startswith(stem) and len(folded) - len(stem) <= 5:
            return en, kind, False
    return None


def _detect_prompt_lang(text: str) -> str:
    low = text.lower()
    if any("\u0600" <= ch <= "\u06FF" for ch in low):
        return "fa"
    if any(ch in "ӣқӯҳҷғ" for ch in low):
        return "tg"
    words = [_fold_word(w) for w in re.findall(r"[^\W\d_]+", low, flags=re.UNICODE)]
    if any(w in _TAJIK_WORD_HINTS for w in words):
        return "tg"
    for w in words:
        for suf in ("хо", "ро", "и"):
            if len(w) > len(suf) + 1 and w.endswith(suf) and w[:-len(suf)] in _TAJIK_WORD_HINTS:
                return "tg"
    if any("а" <= ch <= "я" or ch == "ё" for ch in low):
        return "ru"
    return "en"


_NEG_QUALITY = (
    "worst quality, low quality, blurry, bad photo, bad anatomy, deformed, "
    "mutated, disfigured, ugly, extra limbs, fused fingers, text, watermark, logo, signature, "
    "picture frame, wooden frame, ornate frame, canvas border, framed painting, plush toy, stuffed animal, "
    "nsfw, nude, naked, topless, cleavage, lingerie, sexually suggestive, explicit, cropped, cut off"
)
_NEG_FORBID_PEOPLE = "person, people, human, woman, man, girl, boy, portrait, face, selfie, female, hands"
_EN_PERSON_KEYWORDS = {
    "person", "people", "human", "woman", "women", "man", "men", "girl", "boy",
    "child", "children", "baby", "doctor", "teacher", "astronaut", "portrait", "family",
}


def _detect_art_style(text: str) -> str:
    low = (text or "").lower().replace("ё", "е")
    if re.search(r"(?:қалам|калам|карандаш|эскиз|набросок|штрих|графит|уголь|pencil|charcoal|graphite|sketch)", low):
        return "pencil_sketch"
    if re.search(r"(?:акварел|обранг|watercolor|watercolour)", low):
        return "watercolor"
    if re.search(r"(?:маслом|живопис|равған[ӣи]|равгани|oil\s+painting|canvas\s+painting)", low):
        return "oil_painting"
    if re.search(r"(?:аниме|мульт|манга|anime|manga|cartoon)", low):
        return "anime"
    if re.search(r"(?:\b3d\b|\b3д\b|pixar|blender|изометри)", low):
        return "3d_render"
    if re.search(r"(?:иллюстрац|тасвири\s+баде|illustration|digital\s+art)", low):
        return "illustration"
    return "photo"


def _detect_aspect_ratio_dims(text: str) -> Tuple[str, int, int]:
    low = (text or "").lower().replace("ё", "е")
    if re.search(r"(?:(?<!\d)9\s*[:/xх×\s]\s*16(?!\d)|9\s+на\s+16|вертикальн\w*|сторис|обои\s+на\s+телефон|амуд[ӣи]|portrait\s+format)", low):
        return "9:16", 720, 1280
    if re.search(r"(?:(?<!\d)16\s*[:/xх×\s]\s*9(?!\d)|16\s+на\s+9|горизонтальн\w*|широкоэкран\w*|уфуқ[ӣи]|уфуки|landscape\s+format)", low):
        return "16:9", 1280, 720
    if re.search(r"(?:(?<!\d)4\s*[:/xх×\s]\s*3(?!\d)|4\s+на\s+3)", low):
        return "4:3", 1152, 864
    if re.search(r"(?:(?<!\d)3\s*[:/xх×\s]\s*4(?!\d)|3\s+на\s+4)", low):
        return "3:4", 864, 1152
    return "1:1", 1024, 1024


def _is_text_story_not_image(text: str) -> bool:
    low = (text or "").lower().replace("ё", "е").strip()
    wants_text_genre = bool(
        re.search(
            r"\b(?:сказк\w*|рассказ\w*|истори[юи]|стих\w*|сочинени\w*|эссе|реферат\w*|иншо|афсона\w*|ҳикоя\w*|хикоя\w*|шеър\w*|тарҷума\w*|перевед\w*)\b",
            low,
        )
    )
    has_visual_noun_or_draw = bool(
        re.search(
            r"\b(?:фото\w*|фотк\w*|картин\w*|изображ\w*|рисун\w*|нарисуй\w*|сфотографир\w*|"
            r"расм\w*|сурат\w*|акс(?:и|е|ро)?|тасвир\w*|бикаш\w*|каш\b|"
            r"photo\w*|picture\w*|image\w*|draw\w*|sketch\w*|paint\w*)\b",
            low,
        )
    )
    return wants_text_genre and not has_visual_noun_or_draw


def _clean_user_image_caption(raw_prompt: str, lang: str) -> str:
    """Формирует аккуратную подпись без приветствий, опечаток команд («Сощдай») и технических цифр пропорций."""
    s = (raw_prompt or "").strip()
    # Срезаем начальное приветствие («Салом», «Привет», «Ассалому алайкум», «Алия»)
    s = re.sub(
        r"(?iu)^(?:\s*(?:ассалому\s+алайкум|салом|привет|здравствуй(?:те)?|hello|hi|алия|aliya)\b[\s,!.:;-]*)+",
        "",
        s,
    )
    # Срезаем служебные глаголы генерации в начале (включая частые опечатки «сощдай», «создой», «нарису»)
    s = re.sub(
        r"(?iu)^(?:\s*(?:пожалуйста|лутфан|илтимос|ба\s+ман|барои\s+ман|мне|для\s+меня)\b[\s,]*)*"
        r"(?:со[зщжс]да[йит]\w*|сдела[йит]\w*|сгенериру\w*|нарису\w*|покажи\w*|"
        r"бисоз\w*|соз\b|бикаш\w*|каш\b|тасвир\s+кун\w*|омода\s+кун\w*|draw|create|generate|make)\b[\s,:;-]*",
        "",
        s,
    )
    s = re.sub(
        r"(?iu)^(?:пожалуйста|лутфан|ба\s+ман|мне)?\s*(?:фото(?:графию)?|картинк[уи]|изображение|рисунок|расми|расм|сурати|сурат|акси|аксе|акс|image|photo|picture)\s*(?:дар\s+бораи|про|о\b|of\b)?\s*",
        "",
        s,
    )
    # Срезаем хвосты «соз», «бикаш», «кун» и пропорции «9 16», «16:9»
    s = re.sub(r"(?iu)\b(?:дар\s+формати|бо\s+андозаи|в\s+формате|размер(?:ом)?|формат)?\s*(?<!\d)(?:9\s*[:/xх×\s]\s*16|16\s*[:/xх×\s]\s*9|4\s*[:/xх×\s]\s*3|3\s*[:/xх×\s]\s*4|1\s*[:/xх×\s]\s*1)(?!\d)", " ", s)
    s = re.sub(r"(?iu)\s+\b(?:бисоз|бикаш|созед|кашед|тасвир\s+кун|соз)\s*[.!?]*$", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,.;:!?-")
    if not s:
        return {"tg": "Тасвири омодашуда", "en": "Generated image"}.get(lang, "Созданное изображение")
    return s[0].upper() + s[1:]


_ANIMAL_SPECIES_DESCRIPTORS = {
    "bear": "large brown grizzly bear with round ears and heavy fur",
    "wolf": "slender gray timber wolf with pointed ears and narrow snout",
    "lion": "golden maned African lion",
    "tiger": "orange striped Bengal tiger",
    "dog": "loyal domestic dog",
    "cat": "graceful domestic cat",
    "horse": "noble full-bodied horse",
    "fox": "red fox with bushy tail",
    "rabbit": "fluffy wild hare",
    "hare": "fluffy wild hare",
    "eagle": "majestic golden eagle",
}


def _separate_dual_subjects_for_sdxl(en_clean: str) -> Tuple[str, str]:
    """Разводит два разных вида животных по сторонам композиции, чтобы SDXL не склеивал медведя и волка в двух медведей!"""
    low = en_clean.lower()
    found_animals = [sp for sp in _ANIMAL_SPECIES_DESCRIPTORS if re.search(rf"\b{sp}s?\b", low)]
    if len(found_animals) >= 2:
        a1, a2 = found_animals[0], found_animals[1]
        d1 = _ANIMAL_SPECIES_DESCRIPTORS[a1]
        d2 = _ANIMAL_SPECIES_DESCRIPTORS[a2]
        separated = (
            f"two distinct wild animals side by side: on the left one {d1}, and on the right one {d2}, "
            f"clearly different species anatomy, {en_clean}"
        )
        return separated, f"hybrid animal, fused species, two {a1}s, two {a2}s, duplicate animal"
    if len(found_animals) == 1 and any(p in low for p in ("woman", "girl", "man", "boy", "person")):
        sp = found_animals[0]
        if sp in ("bear", "wolf", "lion", "tiger", "horse"):
            return f"{en_clean}, real living { _ANIMAL_SPECIES_DESCRIPTORS[sp] } outdoors in natural landscape", "plush toy, teddy bear, stuffed animal, indoor studio frame"
    return en_clean, ""


def _compose_sdxl_prompts(
    english_subject: str,
    explicit_category: str = "",
    extra_neg: str = "",
    style: str = "",
) -> Tuple[str, str, str]:
    en_clean = re.sub(r"\s+", " ", english_subject).strip(" ,.;:-")
    en_clean, dual_neg = _separate_dual_subjects_for_sdxl(en_clean)
    en_words = set(re.findall(r"[a-z]+", en_clean.lower()))
    wants_person = (explicit_category in ("person", "mixed")) or bool(en_words & _EN_PERSON_KEYWORDS)
    cat = explicit_category or ("person" if wants_person else "general")
    eff_style = (style or "").strip().lower() or _detect_art_style(en_clean)

    # Важно: никогда не пишем слова `in frame` / `framing` в позитивном промпте — SDXL понимает `frame` буквально как деревянную багетную раму!
    style_neg = ""
    if eff_style == "pencil_sketch":
        pos = (
            f"authentic hand-drawn black graphite pencil sketch of {en_clean} on clean textured white paper, "
            "fine cross-hatching and pencil shading, wide uncropped view with natural margins, monochrome drawing"
        )
        style_neg = "color, colorful, photorealistic camera photo, 3d render, neon"
    elif eff_style == "watercolor":
        pos = (
            f"delicate artistic watercolor painting of {en_clean} on cold-pressed paper, soft washes, expressive brushwork, "
            "wide uncropped composition, high detail"
        )
        style_neg = "camera photo, harsh flash, 3d render"
    elif eff_style == "oil_painting":
        pos = (
            f"masterpiece classical oil painting of {en_clean}, rich brushwork and natural lighting, "
            "wide uncropped composition, museum quality"
        )
    elif eff_style == "anime":
        pos = (
            f"high quality anime illustration of {en_clean}, clean lineart, expressive colors, studio anime aesthetic, "
            "wide uncropped composition"
        )
    elif eff_style == "3d_render":
        pos = (
            f"high-detail 3D render of {en_clean}, physically based lighting, smooth global illumination, "
            "wide uncropped view, 8k"
        )
    elif eff_style == "illustration":
        pos = (
            f"detailed artistic illustration of {en_clean}, harmonious wide composition, rich colors, uncropped view"
        )
    else:
        already_styled = any(k in en_clean.lower() for k in ("8k", "4k", "photorealistic", "high detail", "ultra detailed", "pencil", "sketch", "watercolor"))
        if already_styled:
            pos = f"{en_clean}, wide uncropped view, natural outdoor or real-world environment"
        elif cat == "animal":
            pos = f"natural wide-angle wildlife photograph of {en_clean}, whole animal clearly visible in natural outdoor habitat, sharp focus, realistic fur texture, 8k uhd"
        elif cat == "nature":
            pos = f"scenic wide high-resolution photograph of {en_clean}, natural daylight, vivid authentic colors, sharp focus, 8k uhd"
        elif cat == "food":
            pos = f"appetizing natural photograph of {en_clean}, full dish on table, soft daylight, sharp focus, 8k uhd"
        elif cat in ("place", "vehicle", "object"):
            pos = f"crisp wide-angle architectural photograph of {en_clean}, entire building or object clearly visible from outside, natural daylight, sharp focus, 8k uhd"
        elif wants_person:
            pos = f"natural medium-wide outdoor photograph of {en_clean}, modest everyday attire, full head and shoulders with comfortable space above head, real environment background, soft natural lighting, 8k uhd"
        else:
            pos = f"high-resolution natural wide photograph of {en_clean}, entire subject clearly visible, natural lighting, sharp focus, realistic textures, 8k uhd"

    neg = _NEG_QUALITY if wants_person else f"{_NEG_FORBID_PEOPLE}, {_NEG_QUALITY}"
    for extra in (dual_neg, style_neg, extra_neg):
        if extra and extra not in neg:
            neg = f"{extra}, {neg}"
    return pos, neg, cat


def plan_image_prompt(raw_prompt: str) -> Dict[str, Any]:
    """
    Строит гарантированно точный план генерации для SDXL:
      - Вычищает служебные слова команд («фото», «нарисуй», «расми», «бикаш» и т.д.);
      - Мгновенно переводит известные русские/таджикские объекты и цвета (с поддержкой изафета «саги сафед» -> «white dog»);
      - Если встретились редкие/сложные слова — помечает `needs_nllb=True` для нейросетевого перевода NLLB-200 на GPU с сохранением якорей объекта!
    """
    clean = (raw_prompt or "").strip()
    if not clean:
        return {"english": "", "needs_nllb": False, "src_lang": "en", "anchors": [], "category": "general", "negative": _NEG_QUALITY}

    # Если промпт уже чисто английский без кириллицы/арабицы
    if not any(ord(c) > 127 and c.isalpha() for c in clean):
        pos, neg, cat = _compose_sdxl_prompts(clean)
        return {"english": clean, "positive": pos, "negative": neg, "needs_nllb": False, "src_lang": "en", "anchors": [], "category": cat}

    src_lang = _detect_prompt_lang(clean)
    tokens = re.findall(r"[^\W\d_]+|\d+", clean, flags=re.UNICODE)
    content_tokens = [t for t in tokens if _fold_word(t) not in _DRAW_NOISE_WORDS]
    if not content_tokens:
        content_tokens = tokens

    parsed: List[Dict[str, Any]] = []
    unknown_tokens: List[str] = []
    categories_seen: List[str] = []
    anchors: List[str] = []

    for tok in content_tokens:
        if tok.isdigit():
            parsed.append({"en": tok, "kind": "num", "iz": False})
            continue
        if re.fullmatch(r"[A-Za-z]+", tok):
            parsed.append({"en": tok, "kind": "en", "iz": False})
            continue
        hit = _lookup_visual_token(tok)
        if hit is not None:
            en_w, kind_w, is_iz = hit
            parsed.append({"en": en_w, "kind": kind_w, "iz": is_iz})
            if kind_w in ("animal", "nature", "place", "food", "vehicle", "object", "person"):
                categories_seen.append(kind_w)
                anchors.append(en_w)
        else:
            unknown_tokens.append(tok)

    # Переворачиваем таджикский изафет: «саги калон» (dog + iz + big) -> «big dog»,
    # а конструкции «дерево елка» / «дарахти арча» / «дарахти анор» превращаем в точный вид дерева!
    _FRUIT_TREE_MAP = {
        "pomegranate": "pomegranate tree with ripe red pomegranates on branches",
        "apple": "apple tree with ripe apples on branches",
        "apricots": "apricot tree with ripe golden apricots on branches",
        "peaches": "peach tree with ripe peaches on branches",
        "cherry": "cherry tree with ripe red cherries on branches",
        "walnut": "lush green walnut tree",
        "lemon": "lemon tree with ripe yellow lemons on branches",
    }
    i = 0
    ordered_en: List[str] = []
    promoted_tree_nature = False
    while i < len(parsed):
        cur = parsed[i]
        nxt = parsed[i + 1] if (i + 1 < len(parsed)) else None
        if cur["en"] == "tree" and nxt is not None:
            if "tree" in nxt["en"]:
                ordered_en.append(nxt["en"])
                promoted_tree_nature = True
                i += 2
                continue
            if nxt["en"] in _FRUIT_TREE_MAP:
                ordered_en.append(_FRUIT_TREE_MAP[nxt["en"]])
                promoted_tree_nature = True
                i += 2
                continue
        if nxt is not None and cur["iz"] and nxt["kind"] == "adj":
            ordered_en.append(nxt["en"])
            ordered_en.append(cur["en"])
            i += 2
        else:
            ordered_en.append(cur["en"])
            i += 1

    if promoted_tree_nature:
        categories_seen = ["nature" if c == "food" else c for c in categories_seen]

    has_person = "person" in categories_seen
    non_person = [c for c in categories_seen if c != "person"]
    if has_person and non_person:
        category = "mixed"
    elif has_person:
        category = "person"
    elif non_person:
        category = non_person[0]
    else:
        category = ""

    dict_english = " ".join(ordered_en).strip()
    cleaned_content_str = " ".join(content_tokens).strip()
    needs_nllb = len(unknown_tokens) > 0

    base_en = cleaned_content_str if needs_nllb else (dict_english or "detailed photograph")
    pos, neg, cat_final = _compose_sdxl_prompts(dict_english or "subject", explicit_category=category)
    return {
        "english": dict_english if not needs_nllb else base_en,
        "dict_english": dict_english,
        "positive": pos,
        "negative": neg,
        "needs_nllb": needs_nllb,
        "src_lang": src_lang,
        "anchors": anchors,
        "category": cat_final if category else "",
    }


def _image_prompt_in_english(client: InferenceClient, prompt: str) -> str:
    if not any(ord(c) > 127 and c.isalpha() for c in prompt):
        return prompt
    try:
        response = httpx.get("https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "auto", "tl": "en", "dt": "t", "q": prompt}, timeout=6.0)
        response.raise_for_status()
        data = response.json()
        translated = "".join(part[0] for part in data[0] if part and part[0]).strip()
        if translated and len(translated) <= 1200 and not any("\u0400" <= c <= "\u052F" for c in translated):
            return translated
    except Exception:
        pass
    try:
        if client is not None:
            out = client.chat.completions.create(model="Qwen/Qwen3.5-35B-A3B", messages=[
                {"role": "system", "content": "Translate the image description into English. Preserve all subjects and details. Return only the translation."},
                {"role": "user", "content": prompt}], temperature=0.1, max_tokens=256)
            translated = (out.choices[0].message.content or "").strip()
            if "</think>" in translated:
                translated = translated.split("</think>", 1)[1].strip()
            translated = translated.strip('"')
            if translated and len(translated) <= 1200 and not any("\u0400" <= c <= "\u052F" for c in translated):
                return translated
    except Exception:
        pass
    return prompt



_BRAND_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
)


def _load_brand_font(size: int):
    """Шрифт с кириллицей. Стандартный шрифт Pillow кириллицу не содержит —
    из-за этого подпись «Алия» рисовалась квадратиками."""
    from PIL import ImageFont

    for path in _BRAND_FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    try:
        import matplotlib  # noqa: F401  (ставится вместе с gradio)

        from matplotlib import font_manager

        return ImageFont.truetype(font_manager.findfont("DejaVu Sans"), size)
    except Exception:
        pass
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return None


def _normalize_image_dims(width: Optional[int], height: Optional[int]) -> Tuple[int, int]:
    """Нормализует размеры ИИ-изображения (кратно 16, диапазон 512..1280, по умолчанию 1024x1024)."""
    tw = max(512, min(1280, ((int(width or 1024) + 8) // 16) * 16))
    th = max(512, min(1280, ((int(height or 1024) + 8) // 16) * 16))
    return tw, th


def _ensure_hd_resolution(img, target_w: int = 1024, target_h: int = 1024):
    """Приводит кадр к целевому соотношению сторон и HD-размеру с сохранением пропорций (без растяжения)."""
    from PIL import Image, ImageFilter

    tw, th = _normalize_image_dims(target_w, target_h)
    w, h = img.size
    if w <= 0 or h <= 0:
        return img

    # Если внешний резервный генератор вернул другое соотношение сторон, аккуратно кадрируем по центру без искажения лиц/объектов.
    src_ratio = w / float(h)
    dst_ratio = tw / float(th)
    if abs(src_ratio - dst_ratio) > 0.04:
        if src_ratio > dst_ratio:
            new_w = max(1, int(round(h * dst_ratio)))
            left = max(0, (w - new_w) // 2)
            img = img.crop((left, 0, left + new_w, h))
        else:
            new_h = max(1, int(round(w / dst_ratio)))
            top = max(0, (h - new_h) // 2)
            img = img.crop((0, top, w, top + new_h))
        w, h = img.size

    if w == tw and h == th:
        return img
    resized = img.resize((tw, th), Image.Resampling.LANCZOS)
    if w < tw or h < th:
        try:
            resized = resized.filter(ImageFilter.UnsharpMask(radius=1.15, percent=118, threshold=3))
        except Exception:
            pass
    return resized


def _overlay_aliya_badge_bottom_right(img):
    """
    Добавляет аккуратный фирменный значок «Aliya sharipov» с коралловой чертой в правый нижний угол
    ТОЛЬКО для изображений, сгенерированных ИИ (реальные фотографии и государственные символы через эту функцию не проходят).
    """
    from PIL import Image, ImageDraw

    w, h = img.size
    min_side = min(w, h)
    badge_w = max(92, min(148, int(round(min_side * 0.135))))
    badge_h = max(46, min(74, int(round(badge_w * 0.50))))
    margin = max(12, int(round(min_side * 0.018)))
    radius = max(11, int(round(badge_h * 0.28)))

    base_rgba = img.convert("RGBA")
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    x2 = max(badge_w, w - margin)
    y2 = max(badge_h, h - margin)
    x1 = max(0, x2 - badge_w)
    y1 = max(0, y2 - badge_h)

    draw.rounded_rectangle(
        (x1, y1, x2, y2),
        radius=radius,
        fill=(14, 15, 18, 222),
        outline=(255, 106, 61, 152),
        width=1,
    )

    title_size = max(14, int(round(badge_h * 0.36)))
    sub_size = max(9, int(round(badge_h * 0.21)))
    font_title = _load_brand_font(title_size)
    font_sub = _load_brand_font(sub_size)

    cx = (x1 + x2) / 2.0
    title_text = "Aliya"
    sub_text = "sharipov"

    try:
        tb = draw.textbbox((0, 0), title_text, font=font_title)
        tw_txt = tb[2] - tb[0]
        th_txt = tb[3] - tb[1]
        sb = draw.textbbox((0, 0), sub_text, font=font_sub)
        sw_txt = sb[2] - sb[0]
        sh_txt = sb[3] - sb[1]

        top_pad = max(5, int(round(badge_h * 0.11)))
        tx = int(round(cx - tw_txt / 2.0 - tb[0]))
        ty = int(round(y1 + top_pad - tb[1]))
        draw.text((tx, ty), title_text, font=font_title, fill=(255, 255, 255, 248))

        sx = int(round(cx - sw_txt / 2.0 - sb[0]))
        sy = int(round(y1 + top_pad + th_txt + max(2, int(round(badge_h * 0.05))) - sb[1]))
        draw.text((sx, sy), sub_text, font=font_sub, fill=(226, 232, 240, 228))

        bar_w = max(28, int(round(max(tw_txt, sw_txt) * 0.88)))
        bar_h = max(2, int(round(badge_h * 0.055)))
        bx1 = int(round(cx - bar_w / 2.0))
        bx2 = bx1 + bar_w
        by2 = y2 - max(5, int(round(badge_h * 0.11)))
        by1 = max(y1 + 2, by2 - bar_h)
        draw.rounded_rectangle((bx1, by1, bx2, by2), radius=max(1, bar_h // 2), fill=(255, 106, 61, 245))
    except Exception:
        with Image.open(io.BytesIO(_ALIYA_DOCUMENT_ICON)) as icon_src:
            icon_rgba = icon_src.convert("RGBA").resize((badge_h, badge_h), Image.Resampling.LANCZOS)
        overlay.alpha_composite(icon_rgba, dest=(int(cx - badge_h / 2), y1))

    return Image.alpha_composite(base_rgba, overlay).convert("RGB")


def _brand_image(
    raw: bytes,
    target_w: int = 1024,
    target_h: int = 1024,
    cover_watermark: bool = False,
    add_aliya_badge: bool = True,
) -> bytes:
    """
    Обработка ИИ-изображений Алии:
      1) Приводит кадр к точному запрошенному соотношению сторон (`1024x1024`, `1280x720`, `720x1280`, `1152x864` и др.).
      2) При резервном источнике (`cover_watermark=True`) мягко убирает чужую метку размытием фона.
      3) Размещает фирменный значок Aliya sharipov в правом нижнем углу ИИ-картинки.
    """
    try:
        from PIL import Image, ImageFilter
    except Exception:
        return raw
    try:
        with Image.open(io.BytesIO(raw)) as src:
            img = src.convert("RGB")
        w, h = img.size
        if w < 64 or h < 64:
            return raw

        img = _ensure_hd_resolution(img, target_w, target_h)
        w, h = img.size

        if cover_watermark:
            box_w = max(int(w * 0.22), 164)
            box_h = max(int(h * 0.033), 26)
            margin_x = max(int(w * 0.011), 8)
            margin_y = max(int(h * 0.011), 8)
            x1, y1 = max(0, w - box_w - margin_x), max(0, h - box_h - margin_y)
            x2, y2 = w - margin_x, h - margin_y
            src_y1 = max(0, y1 - box_h - 4)
            src_y2 = max(src_y1 + 4, y1 - 2)
            above_patch = img.crop((x1, src_y1, x2, src_y2)).resize((x2 - x1, y2 - y1), Image.Resampling.BILINEAR)
            soft_patch = above_patch.filter(ImageFilter.GaussianBlur(radius=6))
            img.paste(soft_patch, (x1, y1))

        if add_aliya_badge:
            img = _overlay_aliya_badge_bottom_right(img)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=98, subsampling=0, optimize=True)
        return buf.getvalue()
    except Exception:
        return raw


def _enhance_visual_prompt(english_prompt: str, style: str = "") -> str:
    pos, _, _ = _compose_sdxl_prompts(english_prompt, style=style)
    return pos


_IMAGE_PLANNER_SYSTEM = (
    "You are Aliya's safety verifier and master visual scene director for RealVisXL SDXL (77-token CLIP limit).\n"
    "Analyze the user's request (in Tajik, Russian, or English) and return ONLY valid JSON:\n"
    '{"is_safe": true/false, "should_draw": true/false, "style": "photo|pencil_sketch|watercolor|oil_painting|illustration|anime|3d_render", '
    '"aspect_ratio": "1:1|9:16|16:9|4:3|3:4", "english_prompt": "...", "clean_caption": "..."}\n'
    "Strict Visual Director Rules:\n"
    "1. SAFETY (ZERO TOLERANCE): Set is_safe=false for ANY nudity, breasts, genitalia, underwear/lingerie, sexual/erotic content, "
    "or ANY minor (<18) in revealing/romantic/body context.\n"
    "2. INTENT: Set should_draw=false if the user wants written text (story, fairy tale, poem, essay, translation, explanation).\n"
    "3. STYLE: Preserve requested medium! E.g. 'бо қалами сиёҳ' / 'бо калами сех' / 'чёрным карандашом' -> style='pencil_sketch'.\n"
    "4. SCENE EXPANSION (25-52 vivid English words, NO Cyrillic, NEVER write the word 'frame'):\n"
    "   - NEVER output generic mountains/landscapes unless the user asked for mountains/nature! Every requested object MUST be the main subject.\n"
    "   - BUILDINGS & SCHOOLS: Unless the user explicitly asked for 'класс внутри / парта / classroom interior', ALWAYS describe the full exterior facade of the building with entrance and courtyard outside.\n"
    "   - HISTORICAL ERA & REGION: Expand years/places into concrete visual details (e.g. 'школы 1981 годах в Таджикистан' -> '1981 vintage color film photograph of the exterior front facade of a classic two-story Soviet-era light brick school building in sunny Tajikistan, shady green courtyard with tall poplar and chinar trees, 1980s atmosphere').\n"
    "   - MULTIPLE ANIMALS / SUBJECTS: Prevent feature blending by placing subjects separately ('on the left one large brown grizzly bear with round ears, on the right one slender gray timber wolf with pointed ears and narrow snout') and specify 'real living wild animal outdoors' when a person is next to an animal.\n"
    "5. CAPTION: clean_caption must be a neat grammatical title in the user's language (e.g. 'Здание школы снаружи', 'Школа 1981 года в Таджикистане', 'Девушка с медведем') WITHOUT greetings, command words, or aspect-ratio numbers."
)


def _enrich_visual_scene_for_sdxl(en_prompt: str, raw_user_text: str) -> str:
    """
    Доводит английский промпт до идеала под CLIP-энкодер RealVisXL SDXL:
      - убирает запретное слово `frame` (рисовавшее деревянную рамку);
      - раскрывает «школа» -> фасад здания школы снаружи со двором (если не просили класс внутри);
      - раскрывает исторические годы (`1981` и др.) и колорит Таджикистана без замены здания пустыми горами!
    """
    s = re.sub(r"\b(?:inside|in)\s+(?:the\s+)?frame\b|\bframing\b", "wide view", en_prompt or "", flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip(" ,.;:-")
    raw_low = (raw_user_text or "").lower().replace("ё", "е")
    en_low = s.lower()

    wants_interior = any(k in raw_low for k in ("внутри", "класс", "парт", "урок", "доск", "синфхона", "дарун", "interior", "classroom", "inside"))
    mentions_school = any(k in raw_low for k in ("школ", "мактаб", "school")) or "school" in en_low
    if mentions_school and not wants_interior and "facade" not in en_low:
        s = re.sub(r"\bschool(\s+building)?\b", "exterior front facade of a bright two-story school building with courtyard and green trees outside", s, count=1, flags=re.IGNORECASE)
        if "exterior" not in s.lower():
            s = f"exterior front facade of a two-story school building with green courtyard outside, {s}"

    year_m = re.search(r"\b(19[4-9]\d)\b", raw_low)
    if year_m and "vintage" not in s.lower() and "film" not in s.lower():
        yr = year_m.group(1)
        era_tag = f"{yr} vintage color film photograph, authentic Soviet-era architecture and atmosphere" if int(yr) <= 1991 else f"{yr} era photograph"
        s = f"{era_tag}, {s}"

    if any(k in raw_low for k in ("таджикистан", "тоҷикистон", "точикистон", "душанбе", "хуҷанд", "худжанд")) and mentions_school:
        if "poplar" not in s.lower() and "chinar" not in s.lower():
            s = f"{s}, sunny Central Asian schoolyard with tall poplar and chinar trees"

    return re.sub(r"\s+", " ", s).strip(" ,.;:-")


def _ai_plan_image_sync(raw_prompt: str, ui_lang: str = "ru") -> Dict[str, Any]:
    """
    Двухступенчатая подготовка генерации изображения:
      Стена 1 (ДО ИИ, 0 мс): `check_nsfw_safety` мгновенно блокирует любые 18+ / наготу / обходы (`се**с`, `пизд@`).
      Стена 2 (Умный ИИ-Режиссёр): выбирает живую языковую модель (пропуская 404/402/429 за 0 мс!),
      раскрывает эпоху, архитектуру и композицию в 25–52 английских слова специально под `RealVisXL V5.0 Lightning`.
    """
    global _gemini_cooldown_until
    text = (raw_prompt or "").strip()
    own_lang = _detect_utterance_own_language(text) if text else (ui_lang if ui_lang in ("tg", "ru", "en") else "ru")

    # Стена 1: мгновенный пред-ИИ блок 18+ / CSAM
    safety_hit = check_nsfw_safety(text, is_image_context=True)
    if safety_hit is not None:
        return {
            "ok": True,
            "blocked": True,
            "should_draw": False,
            "lang": safety_hit["lang"],
            "message": safety_hit["message"],
        }

    # Защита от ложного срабатывания на текстовые сказки/рассказы («Расскажи сказку про репку»)
    if _is_text_story_not_image(text):
        return {
            "ok": True,
            "blocked": False,
            "should_draw": False,
            "lang": own_lang,
        }

    ratio_str, def_w, def_h = _detect_aspect_ratio_dims(text)
    det_style = _detect_art_style(text)
    det_caption = _clean_user_image_caption(text, own_lang)

    parsed_json: Optional[Dict[str, Any]] = None
    gem_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gem_key and time.time() >= _gemini_cooldown_until:
        try:
            payload = {
                "systemInstruction": {"parts": [{"text": _IMAGE_PLANNER_SYSTEM}]},
                "contents": [{"role": "user", "parts": [{"text": text}]}],
                "generationConfig": {
                    "temperature": 0.15,
                    "maxOutputTokens": 300,
                    "responseMimeType": "application/json",
                    "thinkingConfig": {"thinkingBudget": 0},
                },
            }
            r = httpx.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                headers={"x-goog-api-key": gem_key},
                json=payload,
                timeout=4.5,
            )
            if r.status_code == 429:
                _gemini_cooldown_until = time.time() + 90.0
            elif r.status_code == 200:
                parts = ((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                raw_j = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                m_j = re.search(r"\{[\s\S]*\}", raw_j)
                if m_j:
                    parsed_json = json.loads(m_j.group(0))
        except Exception as exc:
            logging.warning("Gemini image planner fallback (%s)", type(exc).__name__)

    if parsed_json is None:
        for prov in _select_healthy_providers(exclude_gpt_oss=True)[:6]:
            try:
                r = httpx.post(
                    prov["url"],
                    headers={"Authorization": f"Bearer {prov['key']}", "Content-Type": "application/json"},
                    json={
                        "model": prov["model"],
                        "messages": [
                            {"role": "system", "content": _IMAGE_PLANNER_SYSTEM},
                            {"role": "user", "content": text},
                        ],
                        "temperature": 0.15,
                        "max_tokens": 300,
                    },
                    timeout=4.5,
                )
                _mark_provider_http_status(prov["name"], prov["key"], r.status_code)
                if r.status_code == 200:
                    raw_j = (((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
                    if "</think>" in raw_j:
                        raw_j = raw_j.split("</think>", 1)[1].strip()
                    raw_j = re.sub(r"<think>[\s\S]*?</think>", "", raw_j).strip()
                    m_j = re.search(r"\{[\s\S]*\}", raw_j)
                    if m_j:
                        parsed_json = json.loads(m_j.group(0))
                        break
            except Exception:
                continue

    if isinstance(parsed_json, dict):
        if parsed_json.get("is_safe") is False:
            return {
                "ok": True,
                "blocked": True,
                "should_draw": False,
                "lang": own_lang,
                "message": safety_refusal_message(own_lang),
            }
        if parsed_json.get("should_draw") is False:
            return {
                "ok": True,
                "blocked": False,
                "should_draw": False,
                "lang": own_lang,
            }
        ai_ratio = str(parsed_json.get("aspect_ratio") or "").strip()
        ratio_map = {
            "9:16": (720, 1280),
            "16:9": (1280, 720),
            "4:3": (1152, 864),
            "3:4": (864, 1152),
            "1:1": (1024, 1024),
        }
        if ratio_str != "1:1":
            final_w, final_h = def_w, def_h
        elif ai_ratio in ratio_map:
            ratio_str = ai_ratio
            final_w, final_h = ratio_map[ai_ratio]
        else:
            final_w, final_h = def_w, def_h

        ai_style = str(parsed_json.get("style") or "").strip().lower()
        valid_styles = {"photo", "pencil_sketch", "watercolor", "oil_painting", "illustration", "anime", "3d_render"}
        final_style = det_style if det_style != "photo" else (ai_style if ai_style in valid_styles else "photo")

        en_p = re.sub(r"[\u0400-\u052F\u0600-\u06FF]+", " ", str(parsed_json.get("english_prompt") or "")).strip()
        en_p = _enrich_visual_scene_for_sdxl(en_p, text)
        if check_nsfw_safety(en_p, is_image_context=True) is not None:
            return {
                "ok": True,
                "blocked": True,
                "should_draw": False,
                "lang": own_lang,
                "message": safety_refusal_message(own_lang),
            }
        cap = str(parsed_json.get("clean_caption") or "").strip() or det_caption
        if re.search(r"[A-Za-z]{2,}", en_p):
            return {
                "ok": True,
                "blocked": False,
                "should_draw": True,
                "lang": own_lang,
                "english_prompt": en_p,
                "style": final_style,
                "aspect_ratio": ratio_str,
                "width": final_w,
                "height": final_h,
                "clean_caption": cap,
            }

    # Многоступенчатый безотказный переводчик (Google GTX -> локальный NLLB-200 на CPU -> визуальный словарь + обогащение сцены),
    # ПОЛНОСТЬЮ БЕЗ подмены на «scenic mountain landscape»!
    det_plan = plan_image_prompt(det_caption or text)
    anchors = det_plan.get("anchors") or []
    en_fallback = det_plan.get("dict_english") or ""
    if det_plan.get("needs_nllb") or not re.search(r"[A-Za-z]{2,}", en_fallback):
        hf_tok = os.getenv("HF_TOKEN", "").strip()
        client = InferenceClient(api_key=hf_tok) if hf_tok else None
        translated = _image_prompt_in_english(client, det_caption or text)
        if any("\u0400" <= c <= "\u052F" for c in translated):
            try:
                translated = _translate_via_nllb(det_caption or text, det_plan.get("src_lang", "ru"), use_cuda=False)
            except Exception:
                pass
        translated_en = re.sub(r"[\u0400-\u052F\u0600-\u06FF]+", " ", translated).strip()
        if re.search(r"[A-Za-z]{2,}", translated_en):
            missing_anchors = [a for a in anchors if a.split()[0].lower() not in translated_en.lower()]
            en_fallback = (", ".join(missing_anchors) + ", " + translated_en) if missing_anchors else translated_en

    en_fallback = _enrich_visual_scene_for_sdxl(
        re.sub(r"[\u0400-\u052F\u0600-\u06FF]+", " ", en_fallback).strip(),
        text,
    ) or "detailed high-resolution photograph"
    return {
        "ok": True,
        "blocked": False,
        "should_draw": True,
        "lang": own_lang,
        "english_prompt": en_fallback,
        "style": det_style,
        "aspect_ratio": ratio_str,
        "width": def_w,
        "height": def_h,
        "clean_caption": det_caption,
    }


@router.post("/v1/image/plan")
async def plan_image_endpoint(req: ImagePlanRequest):
    return await asyncio.to_thread(_ai_plan_image_sync, req.prompt, req.ui_lang)


@router.post("/v1/image")
async def generate_image(req: ImageRequest):
    prompt = (req.prompt or "").strip()
    if not prompt:
        return {"image_base64": "", "error": "Empty prompt"}

    # 0. Жёсткая пред-ИИ защита 18+ / наготы / CSAM ДО любой модели и GPU!
    safety_hit = check_nsfw_safety(prompt, is_image_context=True)
    if safety_hit is not None:
        return {
            "image_base64": "",
            "blocked": True,
            "error": "safety_blocked",
            "lang": safety_hit["lang"],
            "message": safety_hit["message"],
        }

    req_w, req_h = int(req.width or 1024), int(req.height or 1024)
    if req_w == 1024 and req_h == 1024:
        _, det_w, det_h = _detect_aspect_ratio_dims(prompt)
        req_w, req_h = det_w, det_h
    target_w, target_h = _normalize_image_dims(req_w, req_h)
    seed = req.seed if req.seed is not None else random.randint(1, 2_000_000_000)
    eff_style = (req.style or "").strip().lower() or _detect_art_style(prompt)

    # Если ZeroGPU активен, заранее готовим точный английский промпт через ИИ-мозг на CPU,
    # чтобы НЕ грузить 2.4 ГБ NLLB-200 на видеокарту и сразу подать чистый промпт в RealVisXL V5.0 Lightning!
    planned_en = ""
    if req.already_planned and not any(ord(c) > 127 and c.isalpha() for c in prompt):
        planned_en = prompt
    elif _zerogpu_image_fn is not None:
        ai_plan = await asyncio.to_thread(_ai_plan_image_sync, prompt, "ru")
        if ai_plan.get("blocked"):
            return {
                "image_base64": "",
                "blocked": True,
                "error": "safety_blocked",
                "lang": ai_plan.get("lang", "ru"),
                "message": ai_plan.get("message", safety_refusal_message("ru")),
            }
        planned_en = str(ai_plan.get("english_prompt") or "").strip()
        if not req.style and ai_plan.get("style"):
            eff_style = str(ai_plan["style"])

    plan = plan_image_prompt(planned_en or prompt)

    # 1. Основной генератор №1: собственная ZeroGPU видеокарта Space (`RealVisXL V5.0 Lightning` + значок Aliya sharipov)
    if _zerogpu_image_fn is not None:
        try:
            gpu_en = planned_en if re.search(r"[A-Za-z]{2,}", planned_en) else plan["english"]
            gpu_needs_nllb = False if re.search(r"[A-Za-z]{2,}", gpu_en) and not any("\u0400" <= c <= "\u052F" for c in gpu_en) else bool(plan["needs_nllb"])
            raw_jpeg = await asyncio.to_thread(
                _zerogpu_image_fn,
                gpu_en,
                plan["negative"],
                gpu_needs_nllb,
                plan["src_lang"],
                plan["anchors"],
                plan["category"],
                target_w,
                target_h,
                seed,
                eff_style,
            )
            if raw_jpeg and len(raw_jpeg) > 4096:
                branded_jpeg = await asyncio.to_thread(_brand_image, raw_jpeg, target_w, target_h, False, True)
                b64 = base64.b64encode(branded_jpeg).decode("ascii")
                return {
                    "image_base64": b64,
                    "mime": "image/jpeg",
                    "width": target_w,
                    "height": target_h,
                    "provider": "aliya-zerogpu-hd",
                }
        except Exception as exc:
            logging.warning("ZeroGPU image generation fallback (%s)", type(exc).__name__)

    hf_tok = os.getenv("HF_TOKEN", "").strip()
    client = InferenceClient(api_key=hf_tok) if hf_tok else None
    eng_prompt = planned_en or plan.get("dict_english") or await asyncio.to_thread(_image_prompt_in_english, client, prompt)
    if any("\u0400" <= c <= "\u052F" for c in eng_prompt):
        try:
            eng_prompt = await asyncio.to_thread(_translate_via_nllb, prompt, plan["src_lang"], False)
        except Exception:
            eng_prompt = plan.get("dict_english") or "detailed high-resolution photograph"
    hd_prompt = _enhance_visual_prompt(eng_prompt, style=eff_style)

    # 2. Резервный путь через HF InferenceClient (передаёт точные размеры width/height при нестандартном формате)
    if client is not None:
        for img_model in CANDIDATE_IMAGE_MODELS:
            try:
                def _call_hf_t2i(m=img_model):
                    if target_w != 1024 or target_h != 1024:
                        try:
                            return client.text_to_image(eng_prompt, model=m, width=target_w, height=target_h)
                        except TypeError:
                            return client.text_to_image(eng_prompt, model=m)
                    return client.text_to_image(eng_prompt, model=m)

                pil_img = await asyncio.to_thread(_call_hf_t2i)
                raw_buf = io.BytesIO()
                pil_img.convert("RGB").save(raw_buf, format="PNG")
                polished = await asyncio.to_thread(_brand_image, raw_buf.getvalue(), target_w, target_h, False, True)
                b64 = base64.b64encode(polished).decode("ascii")
                return {"image_base64": b64, "mime": "image/jpeg", "width": target_w, "height": target_h}
            except Exception:
                continue

    # 3. Аварийный внешний резерв (с удалением сторонней метки и добавлением фирменного значка Aliya)
    for attempt in range(2):
        try:
            encoded = urllib.parse.quote(hd_prompt)
            cur_seed = (seed + attempt * 7919) & 0x7FFFFFFF
            url = (
                f"https://image.pollinations.ai/prompt/{encoded}"
                f"?width={target_w}&height={target_h}&nologo=true&model=flux&seed={cur_seed}"
            )
            async with httpx.AsyncClient(timeout=38.0, follow_redirects=True) as hc:
                r = await hc.get(url)
                if r.status_code in (402, 429) and attempt == 0:
                    await asyncio.sleep(11.0)
                    continue
                if r.status_code == 200 and len(r.content) > 2048:
                    cleaned = await asyncio.to_thread(_brand_image, r.content, target_w, target_h, True, True)
                    b64 = base64.b64encode(cleaned).decode("ascii")
                    return {"image_base64": b64, "mime": "image/jpeg", "width": target_w, "height": target_h}
        except Exception:
            break

    return {"image_base64": "", "error": "Image generation unavailable"}


_WHISPER_HALLUCINATION_RE = re.compile(
    r"(?iu)^(?:\s*(?:субтитры\s+(?:сделал|создал|подготовил|добавил)|редактор\s+субтитров|"
    r"продолжение\s+следует|подпишись\s+на\s+канал|спасибо\s+за\s+просмотр|"
    r"thank(?:s|\s+you)\s+for\s+watching|subtitles\s+by|amara\.org).*)$"
)


def _clean_asr_hallucination(txt: str) -> str:
    s = (txt or "").strip().strip('"«»')
    if not s or _WHISPER_HALLUCINATION_RE.match(s):
        return ""
    return s


def _is_plausible_tajik_transcript(txt: str) -> bool:
    """Отсекает галлюцинации необученного Whisper на таджикской речи, пропуская настоящие таджикские и двуязычные фразы."""
    s = _clean_asr_hallucination(txt)
    if not s:
        return False
    if any(ch in "ӣқӯҳҷғӢҚӮҲҶҒ" for ch in s):
        return True
    low = s.lower().replace("ё", "е")
    words = re.findall(r"[а-яa-z]+", low)
    if not words:
        return False
    common_ok = _CHAT_TJ_WORDS | _CHAT_RU_WORDS | {
        "чарогак", "будильник", "таймер", "соат", "дакика", "хаво", "обу", "курси", "доллар",
        "мусики", "суруд", "интернет", "вайфай", "блютуз", "ёддошт", "еддошт", "заметк", "фонарик",
    }
    if any(w in common_ok for w in words):
        return True
    # Если Whisper выдал латиницу или случайные украинские/болгарские/узбекские буквы («і», «ї», «є», «ў») на lang="tg" — это брак
    if any(ch in "іїєґўІЇЄҐЎ" for ch in s):
        return False
    return any("а" <= ch <= "я" for ch in low) and len(words) <= 6


def _transcribe_via_gemini_audio(wav_bytes: bytes, lang: str) -> Optional[str]:
    """
    Высокоточное мультимодальное распознавание таджикской, русской и английской речи через Gemini 2.5 Flash:
    понимает живую таджикскую речь (Душанбе, Худжанд и др.) и сразу записывает литературной таджикской кириллицей (`ӣ, қ, ӯ, ҳ, ҷ, ғ`).
    """
    gem_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not gem_key:
        return None
    lang_hint = (
        "Язык речи преимущественно таджикский (или смешанный таджикско-русский): пиши таджикские слова СТРОГО литературной таджикской кириллицей (ӣ, қ, ӯ, ҳ, ҷ, ғ), без персидской вязи и без узбекских букв."
        if lang == "tg"
        else "Определи язык речи автоматически (таджикский -> пиши строго таджикской кириллицей с буквами ӣ, қ, ӯ, ҳ, ҷ, ғ; русский -> по-русски; английский -> по-английски)."
    )
    sys_prompt = (
        "Ты точный модуль распознавания речи Алии. Дословно запиши произнесённую пользователем фразу без кавычек и без комментариев. "
        + lang_hint
        + " Если на записи тишина или неразборчивый шум без речи, верни пустую строку."
    )
    payload = {
        "systemInstruction": {"parts": [{"text": sys_prompt}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "audio/wav", "data": base64.b64encode(wav_bytes).decode("ascii")}},
                    {"text": "Распознай речь дословно:"},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 192,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    try:
        with httpx.Client(timeout=6.2) as hc:
            r = hc.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                headers={"x-goog-api-key": gem_key},
                json=payload,
            )
            if r.status_code == 200:
                parts = ((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                txt = _clean_asr_hallucination("".join(p.get("text", "") for p in parts if not p.get("thought")))
                if txt:
                    return txt
    except Exception as exc:
        logging.warning("Gemini audio STT fallback (%s)", type(exc).__name__)
    return None


def _transcribe_via_fast_cloud_whisper(wav_bytes: bytes, lang: str) -> Optional[str]:
    """
    Быстрое облачное распознавание речи (Тоҷикӣ / Русский / English):
      1) Если настроен `GEMINI_API_KEY`, для таджикского (`tg`) и авто-режима (`auto`) сначала использует
         мультимодальный слух Gemini 2.5 Flash (родная таджикская кириллица без ошибок Whisper!).
      2) Затем сверхбыстрый Whisper Large v3 Turbo с проверкой валидности таджикского текста.
    """
    if lang in ("tg", "auto") and os.getenv("GEMINI_API_KEY", "").strip():
        gem_txt = _transcribe_via_gemini_audio(wav_bytes, lang)
        if gem_txt:
            return gem_txt

    vocab_prompt = (
        "Салом, Алия! Чӣ хел ҳастед? Ба ман бигӯ, обу ҳаво дар Хуҷанд ва Душанбе чӣ гуна аст? Чароғакро гирон кун."
        if lang == "tg"
        else "Привет, Алия! Салом, Алия! Hello Aliya."
    )
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_key:
        try:
            files = {"file": ("speech.wav", wav_bytes, "audio/wav")}
            data: Dict[str, str] = {
                "model": "whisper-large-v3-turbo",
                "response_format": "json",
                "temperature": "0",
                "prompt": vocab_prompt,
            }
            if lang in ("ru", "en"):
                data["language"] = lang
            with httpx.Client(timeout=6.5) as hc:
                resp = hc.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {groq_key}"},
                    data=data,
                    files=files,
                )
                if resp.status_code == 200:
                    txt = _clean_asr_hallucination(resp.json().get("text") or "")
                    if txt and (lang != "tg" or _is_plausible_tajik_transcript(txt)):
                        return txt
        except Exception as exc:
            logging.warning("Fast cloud STT primary fallback (%s)", type(exc).__name__)

    # Мгновенный второй быстрый канал Cloudflare Whisper Large v3 Turbo (~0.5 с без ожидания ZeroGPU)
    cf_key = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    cf_account = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if cf_key and re.fullmatch(r"[a-fA-F0-9]{32}", cf_account):
        try:
            cf_payload: Dict[str, Any] = {
                "audio": base64.b64encode(wav_bytes).decode("ascii"),
                "initial_prompt": vocab_prompt,
            }
            if lang in ("ru", "en"):
                cf_payload["language"] = lang
            with httpx.Client(timeout=6.5) as hc:
                r_cf = hc.post(
                    f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/ai/run/@cf/openai/whisper-large-v3-turbo",
                    headers={"Authorization": f"Bearer {cf_key}", "Content-Type": "application/json"},
                    json=cf_payload,
                )
                if r_cf.status_code == 200:
                    res_obj = (r_cf.json() or {}).get("result") or {}
                    txt_cf = _clean_asr_hallucination(str(res_obj.get("text") or ""))
                    if txt_cf and (lang != "tg" or _is_plausible_tajik_transcript(txt_cf)):
                        return txt_cf
        except Exception as exc:
            logging.warning("Fast cloud STT secondary fallback (%s)", type(exc).__name__)

    if lang in ("ru", "en") and os.getenv("GEMINI_API_KEY", "").strip():
        return _transcribe_via_gemini_audio(wav_bytes, lang)
    return None


@router.post("/v1/stt")
async def transcribe_speech(req: SttRequest):
    b64 = (req.audio_base64 or "").strip()
    if not b64:
        return {"text": "", "error": "empty_audio"}
    lang = (req.language or "auto").strip().lower()
    if lang not in ("auto", "tg", "ru", "en"):
        lang = "auto"
    if b64 == "WARMUP":
        if lang in ("auto", "tg") and _zerogpu_mms_cache.get("model") is None:
            threading.Thread(target=lambda: _safe_preload_mms(), daemon=True).start()
        return {"text": "", "warmup": "started", "language": lang}
    try:
        wav_bytes = base64.b64decode(b64)
    except Exception:
        return {"text": "", "error": "invalid_base64"}
    if len(wav_bytes) < 256 or len(wav_bytes) > 6_000_000:
        return {"text": "", "error": "invalid_audio_size"}

    # 1. Мгновенный канал (Gemini Audio + проверенный Whisper Large v3 Turbo).
    fast_txt = await asyncio.to_thread(_transcribe_via_fast_cloud_whisper, wav_bytes, lang)
    if fast_txt:
        valid_tg = _is_plausible_tajik_transcript(fast_txt) if lang == "tg" else True
        if req.fast or lang != "tg" or valid_tg or _zerogpu_stt_fn is None:
            return {"text": fast_txt, "language": lang, "provider": "aliya-stt"}

    # Для потоковых промежуточных снимков (`fast=True`) не ставим запрос в 5-секундную очередь ZeroGPU
    if req.fast:
        return {"text": fast_txt or "", "language": lang, "provider": "aliya-stt"}

    # 2. Собственный мультиязычный каскад на ZeroGPU (родная модель таджикского языка MMS-1b `tgk` + Whisper)
    if _zerogpu_stt_fn is not None:
        try:
            out = await asyncio.to_thread(_zerogpu_stt_fn, wav_bytes, lang)
            prov_tag = str(out.get("provider") or "aliya-stt")
            if not prov_tag.startswith("aliya-"):
                prov_tag = "aliya-stt"
            if prov_tag in ("aliya-silent", "aliya-empty"):
                return {"text": "", "language": lang, "provider": prov_tag}
            if out.get("text"):
                return {"text": out["text"], "language": out.get("language", lang), "provider": prov_tag}
        except Exception as exc:
            logging.warning("ZeroGPU STT fallback (%s)", type(exc).__name__)

    if fast_txt:
        return {"text": fast_txt, "language": lang, "provider": "aliya-stt"}

    # 3. Резервный ASR-канал
    hf_tok = os.getenv("HF_TOKEN", "").strip()
    if hf_tok:
        try:
            ic = InferenceClient(api_key=hf_tok, timeout=15)
            asr = await asyncio.to_thread(
                lambda: ic.automatic_speech_recognition(wav_bytes, model="openai/whisper-large-v3-turbo")
            )
            txt = _clean_asr_hallucination(getattr(asr, "text", None) or (asr.get("text") if isinstance(asr, dict) else "") or "")
            if txt:
                return {"text": txt, "language": lang, "provider": "aliya-stt"}
        except Exception as exc:
            logging.warning("HF Whisper fallback failed (%s)", type(exc).__name__)

    return {"text": "", "error": "stt_unavailable"}


def _pcm24k_to_wav(pcm_bytes: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


# Единый умный ЖЕНСКИЙ голос Алии: мужские голоса и казахский акцент полностью исключены!
ALLOWED_NEURAL_VOICES = {
    "fa-IR-DilaraNeural",
    "ru-RU-SvetlanaNeural",
    "en-GB-SoniaNeural",
}

_TJ_UNITS_WORDS = [
    "сифр", "як", "ду", "се", "чор", "панҷ", "шаш", "ҳафт", "ҳашт", "нӯҳ",
    "даҳ", "ёздаҳ", "дувоздаҳ", "сенздаҳ", "чордаҳ", "понздаҳ", "шонздаҳ", "ҳабдаҳ", "ҳаждаҳ", "нуздаҳ",
]
_TJ_TENS_WORDS = ["", "", "бист", "сӣ", "чил", "панҷоҳ", "шаст", "ҳафтод", "ҳаштод", "навад"]


def _int_to_tajik_words(n: int) -> str:
    if n < 0:
        return "манфӣ " + _int_to_tajik_words(-n)
    if n < 20:
        return _TJ_UNITS_WORDS[n]
    if n < 100:
        t, r = divmod(n, 10)
        return _TJ_TENS_WORDS[t] if r == 0 else f"{_TJ_TENS_WORDS[t]}у {_TJ_UNITS_WORDS[r]}"
    if n < 1000:
        h, r = divmod(n, 100)
        h_word = "сад" if h == 1 else ("дусад" if h == 2 else ("сесад" if h == 3 else f"{_TJ_UNITS_WORDS[h]}сад"))
        return h_word if r == 0 else f"{h_word}у {_int_to_tajik_words(r)}"
    if n < 1_000_000:
        th, r = divmod(n, 1000)
        th_word = "ҳазор" if th == 1 else f"{_int_to_tajik_words(th)} ҳазор"
        return th_word if r == 0 else f"{th_word}у {_int_to_tajik_words(r)}"
    if n < 1_000_000_000:
        ml, r = divmod(n, 1_000_000)
        ml_word = f"{_int_to_tajik_words(ml)} миллион"
        return ml_word if r == 0 else f"{ml_word}у {_int_to_tajik_words(r)}"
    return str(n)


def _expand_tajik_digits_for_tts(text: str) -> str:
    s = re.sub(
        r"(\d+)[.,](\d+)",
        lambda m: f"{_int_to_tajik_words(int(m.group(1)))} бутуну {_int_to_tajik_words(int(m.group(2)))}",
        text,
    )
    return re.sub(
        r"\b\d{1,9}\b",
        lambda m: _int_to_tajik_words(int(m.group(0))),
        s,
    )


_TJ_CYR_TO_FA_VOICE_MAP = {
    "а": "ا", "б": "ب", "в": "و", "г": "گ", "ғ": "غ", "д": "د", "е": "ه", "ё": "یا",
    "ж": "ژ", "з": "ز", "и": "ی", "ӣ": "ی", "й": "ی", "к": "ک", "қ": "ق", "л": "ل",
    "м": "م", "н": "ن", "о": "آ", "п": "پ", "р": "ر", "с": "س", "т": "ت", "у": "و",
    "ӯ": "و", "ф": "ف", "х": "خ", "ҳ": "ه", "ч": "چ", "ҷ": "ج", "ш": "ش", "ъ": "",
    "э": "ا", "ю": "یو", "я": "یه", "ы": "ی", "ь": "",
}


def _cyrillic_tajik_to_persian_phonetics(text: str) -> str:
    expanded = _expand_tajik_digits_for_tts(text)
    out = []
    for ch in expanded.lower():
        out.append(_TJ_CYR_TO_FA_VOICE_MAP.get(ch, ch))
    return "".join(out)


def _resolve_gender_locked_edge_voice(
    text: str,
    style: str,
    requested_voice: str,
    req_rate: str,
    req_pitch: str,
    req_lang: str = "",
) -> Tuple[str, str, str, str]:
    """
    Возвращает `(prepared_text, female_voice_name, rate, pitch)`:
      - Только женские нейросетевые голоса (`fa-IR-DilaraNeural`, `ru-RU-SvetlanaNeural`, `en-GB-SoniaNeural`).
      - Никаких мужских голосов и никакого казахского акцента (`kk-KZ-AigulNeural`).
    """
    r_clean = req_rate if re.fullmatch(r"[+-]?\d{1,2}%", req_rate or "") else "+3%"
    p_clean = req_pitch if re.fullmatch(r"[+-]?\d{1,2}Hz", req_pitch or "") else "+0Hz"

    if requested_voice in ALLOWED_NEURAL_VOICES:
        prep = text
        if requested_voice == "fa-IR-DilaraNeural" and any("а" <= c.lower() <= "я" or c in "ӣқӯҳҷғӢҚӮҲҶҒ" for c in text):
            prep = _cyrillic_tajik_to_persian_phonetics(text)
        return prep, requested_voice, r_clean, p_clean

    has_persian = any("\u0600" <= ch <= "\u06FF" for ch in text)
    has_tj_diacritics = any(ch in "ӣқӯҳҷғӢҚӮҲҶҒ" for ch in text)
    has_cyrillic = any(("а" <= ch.lower() <= "я") or ch in "ёЁӣқӯҳҷғӢҚӮҲҶҒ" for ch in text)
    has_latin = any("a" <= ch.lower() <= "z" for ch in text)

    if has_persian:
        return text, "fa-IR-DilaraNeural", "+2%", "+0Hz"
    if req_lang == "tg" or has_tj_diacritics:
        return _cyrillic_tajik_to_persian_phonetics(text), "fa-IR-DilaraNeural", "+2%", "+0Hz"
    if req_lang == "en" or (has_latin and not has_cyrillic):
        return text, "en-GB-SoniaNeural", "+2%", "+0Hz"
    return text, "ru-RU-SvetlanaNeural", "+3%", "+0Hz"


@router.post("/v1/tts")
async def synthesize_tts(req: TtsRequest):
    text = (req.text or "").strip()
    if not text:
        return Response(content=b"", media_type="audio/mpeg")

    style = req.voice_style if req.voice_style in EDGE_VOICE_MAP else "russian_warm"
    prepared_text, voice_name, rate, pitch = _resolve_gender_locked_edge_voice(
        text,
        style,
        (req.voice_name or "").strip(),
        (req.rate or "").strip(),
        (req.pitch or "").strip(),
        req_lang=(req.lang or "").strip().lower(),
    )
    for attempt in range(3):
        try:
            mp3_buf = bytearray()
            comm = edge_tts.Communicate(prepared_text, voice_name, rate=rate, pitch=pitch)
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    mp3_buf.extend(chunk["data"])
            if mp3_buf:
                return Response(content=bytes(mp3_buf), media_type="audio/mpeg")
        except Exception:
            if attempt < 2:
                await asyncio.sleep(0.35 * (attempt + 1))
    return Response(content=b"", status_code=502, media_type="audio/mpeg")


# ==============================================================================
# ДОКУМЕНТНЫЙ ДВИЖОК АЛИИ v1.0.0: ЧТЕНИЕ, СОЗДАНИЕ И КОНВЕРТАЦИЯ (PDF / DOCX / XLSX / TXT)
# ==============================================================================
def _safe_doc_stem(raw_title: str, fallback: str = "Aliya_Document") -> str:
    cleaned = re.sub(r"[^\w\s\-а-яёӣқӯҳҷғА-ЯЁӢҚӮҲҶҒ]", "", (raw_title or "").strip())
    cleaned = re.sub(r"\s+", "_", cleaned).strip("_")
    return (cleaned[:48] or fallback)


def _strip_md_inline(line: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
    s = re.sub(r"__(.+?)__", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    return s.strip()


_DOC_LLM_CHATTER_LINE_RE = re.compile(
    r"(?iu)^\s*(?:📄\s*)?(?:"
    r"если\s+хотите,\s*я\s+сразу\s+оформлю|"
    r"скопируйте\s+(?:этот\s+)?текст\s+в\s+(?:word|ворд|документ)|"
    r"агар\s+хоҳед,\s*ман\s+ин\s+матнро\s+фавран|"
    r"нужно\s+ли\s+сохранить\s+(?:этот\s+)?текст|"
    r"могу\s+также\s+оформить\s+в\s+(?:pdf|docx|word)"
    r").*$"
)


def _parse_markdown_blocks(md_text: str) -> Tuple[List[Tuple[str, str]], List[List[List[str]]]]:
    """Разбирает Markdown-текст на блоки (h1/h2/h3/bullet/p/code) и таблицы без потери отступов в коде."""
    blocks: List[Tuple[str, str]] = []
    tables: List[List[List[str]]] = []
    cur_table: List[List[str]] = []
    in_code_fence = False
    cur_code_lines: List[str] = []

    raw_lines = (md_text or "").splitlines()
    for idx, raw_ln in enumerate(raw_lines):
        stripped = raw_ln.strip()

        if stripped.startswith("```"):
            if cur_table:
                tables.append(cur_table)
                blocks.append(("table_ref", str(len(tables) - 1)))
                cur_table = []
            if not in_code_fence:
                in_code_fence = True
                cur_code_lines = []
            else:
                in_code_fence = False
                if cur_code_lines:
                    blocks.append(("code", "\n".join(cur_code_lines)))
                cur_code_lines = []
            continue

        if in_code_fence:
            cur_code_lines.append(raw_ln)
            continue

        is_pipe_row = (
            (stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 2)
            or (
                stripped.count("|") >= 2
                and (
                    bool(cur_table)
                    or (idx + 1 < len(raw_lines) and "|" in raw_lines[idx + 1] and "-" in raw_lines[idx + 1])
                )
            )
        )
        if is_pipe_row:
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            if all(re.fullmatch(r"[:\- ]*", c) for c in cells):
                continue
            cur_table.append([_strip_md_inline(c) for c in cells])
            continue
        else:
            if cur_table:
                tables.append(cur_table)
                blocks.append(("table_ref", str(len(tables) - 1)))
                cur_table = []

        if not stripped or re.fullmatch(r"(?:-{3,}|_{3,}|\*{3,})", stripped):
            continue
        if _DOC_LLM_CHATTER_LINE_RE.match(stripped):
            continue
        if stripped.startswith("### "):
            blocks.append(("h3", _strip_md_inline(stripped[4:])))
        elif stripped.startswith("## "):
            blocks.append(("h2", _strip_md_inline(stripped[3:])))
        elif stripped.startswith("# "):
            blocks.append(("h1", _strip_md_inline(stripped[2:])))
        elif re.match(r"^[-*•]\s+", stripped):
            blocks.append(("bullet", _strip_md_inline(re.sub(r"^[-*•]\s+", "", stripped))))
        elif re.match(r"^\d+[.)]\s+", stripped):
            blocks.append(("p", _strip_md_inline(stripped)))
        else:
            blocks.append(("p", _strip_md_inline(stripped)))

    if in_code_fence and cur_code_lines:
        blocks.append(("code", "\n".join(cur_code_lines)))
    if cur_table:
        tables.append(cur_table)
        blocks.append(("table_ref", str(len(tables) - 1)))
    return blocks, tables


def _extract_document_text_and_tables(raw_bytes: bytes, file_name: str) -> Tuple[str, List[List[List[str]]], int]:
    ext = os.path.splitext((file_name or "").lower())[1]
    tables: List[List[List[str]]] = []

    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw_bytes))
        pages_out: List[str] = []
        for idx, page in enumerate(reader.pages[:60], start=1):
            ptxt = (page.extract_text() or "").strip()
            if ptxt:
                pages_out.append(f"## Страница {idx}\n{ptxt}")
        return ("\n\n".join(pages_out).strip(), tables, len(reader.pages))

    if ext in (".docx",):
        import docx

        doc = docx.Document(io.BytesIO(raw_bytes))
        parts: List[str] = []
        for p in doc.paragraphs:
            t = (p.text or "").strip()
            if not t:
                continue
            style_name = (getattr(getattr(p, "style", None), "name", "") or "").lower()
            if "heading 1" in style_name or "title" in style_name:
                parts.append(f"# {t}")
            elif "heading 2" in style_name:
                parts.append(f"## {t}")
            elif "heading" in style_name:
                parts.append(f"### {t}")
            elif "list" in style_name:
                parts.append(f"• {t}")
            else:
                parts.append(t)
        for tbl in doc.tables:
            t_rows: List[List[str]] = []
            for row in tbl.rows:
                cells = [re.sub(r"\s+", " ", (c.text or "").strip()) for c in row.cells]
                if any(cells):
                    t_rows.append(cells)
            if t_rows:
                tables.append(t_rows)
                md_tbl = ["| " + " | ".join(r) + " |" for r in t_rows]
                if len(md_tbl) >= 1:
                    md_tbl.insert(1, "| " + " | ".join(["---"] * len(t_rows[0])) + " |")
                parts.append("\n".join(md_tbl))
        return ("\n\n".join(parts).strip(), tables, max(1, len(doc.paragraphs) // 18 + 1))

    if ext in (".xlsx", ".xlsm"):
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
        sheet_texts: List[str] = []
        for sname in wb.sheetnames[:12]:
            ws = wb[sname]
            rows_acc: List[List[str]] = []
            for row in ws.iter_rows(values_only=True):
                vals = ["" if v is None else str(v).strip() for v in row]
                if any(vals):
                    rows_acc.append(vals)
                if len(rows_acc) >= 400:
                    break
            if rows_acc:
                tables.append(rows_acc)
                lines = [f"## Лист: {sname}"] + ["| " + " | ".join(r) + " |" for r in rows_acc[:120]]
                sheet_texts.append("\n".join(lines))
        return ("\n\n".join(sheet_texts).strip(), tables, len(wb.sheetnames))

    if ext in (".csv", ".tsv"):
        import csv

        decoded = raw_bytes.decode("utf-8", errors="replace")
        delim = "\t" if ext == ".tsv" else (";" if decoded.count(";") > decoded.count(",") else ",")
        rows = [r for r in csv.reader(io.StringIO(decoded), delimiter=delim) if any(c.strip() for c in r)][:400]
        if rows:
            tables.append(rows)
        md_lines = ["| " + " | ".join(r) + " |" for r in rows[:150]]
        return ("\n".join(md_lines).strip(), tables, 1)

    for enc in ("utf-8", "utf-8-sig", "cp1251", "latin-1"):
        try:
            txt = raw_bytes.decode(enc)
            return (txt.strip(), tables, max(1, len(txt) // 2500 + 1))
        except Exception:
            continue
    return ("", tables, 0)


def _find_unicode_ttf_pair() -> Tuple[Optional[str], Optional[str]]:
    candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
    ]
    for reg, bold in candidates:
        if os.path.exists(reg):
            return reg, (bold if os.path.exists(bold) else reg)
    for root_d, _, files in os.walk("/usr/share/fonts"):
        for fn in files:
            if fn.lower().endswith(".ttf") and ("sans" in fn.lower() or "dejavu" in fn.lower() or "noto" in fn.lower() or "liberation" in fn.lower()):
                p = os.path.join(root_d, fn)
                return p, p
    return None, None


# Оригинальный значок Aliya из ic_launcher_foreground.xml, встроен в пакет сервера.
_ALIYA_DOCUMENT_ICON = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAANgAAADYCAYAAACJIC3tAAAABmJLR0QA/wD/AP+gvaeTAAAVuUlEQVR4nO3deXQUVb4H8O/tzk6S7nSCASSEHWQblXFcWGSHYRfZA/JkHGVz9M2Mjo4zozxnfM7ozLgMLgjIJrIEVJAlbOLCoogIKMgeUEAeSSfdHchCuu/7A9Im6aosnb7dUP39nMMxdW/VrR8evqmq21XVABER0fVIhLoADeb4eFsbRIi2ZulpLaVoAxNaC4kECdQDkIQr/40KcZ0UXEUAHFf/5APIERDfSOnZ7zFjX0Fe3ncASkNaoYZrIWAiKSmpo1uKnvDIXhCiOwBrqIui604RgE8hxWqz2bM6Ly/vdKgLAkIYsISElNbC7JkIiYkA0kNVBxnW1xJ4xwT3XIfDkReqIoIdsMhEa/I4SDkFwJ1B3jeFp4sSWCzNeLXAbv822DsPVsCiLZakyRLicQBNg7RPovKkgPzA4zE/4XLlHA7WTlUHTCRYbfcL4K+QaKh4X0Q1cRlCzvaUXp5ZUFBwQfXOlAUsKSmpk1uK1yDRRdU+iOrAKSAfdzjyZgOQqnaiImDRFovtbxJ4BECEgvGJAml9aaTpgUs5OWdVDB7QgFkslhYS5mUAOgdyXCLF7AKY4nDYVwR6YHOgBkqwJg8HxFoAzQM1JlGQxAIYFR0baysuKtyIAJ4yBuQIlmi1PQOJpwMxFlFISbk6Kso8IScnxxWI4eoaMHOiJflVQE4NRDFE1wIBHCiJEL8szM09E4Cx/BadYLEtFsDIuhZBdO2RxyLMopfdbv++LqP4GzBTosW2FMCouuyc6Bp3SsDd0+FwnPR3AJM/GyVakv8DhouML13CvNVms6X5O0CtA5Zotc3kNReFkaalpViflJRk8WfjWgXMYrGNhMRf/NkR0XVLoL3bI5bCjxsnavw52JUPkU1rAcTUdidEBtAyOiYupbi4cF1tNqppwKKjY+qtB9Cs9nURGcZt0dFxJ4qLC/fXdIManSJaLLa/gbc/EQFCzkpMrN+yxqtXt0J8UlIHk0d8BSCyToURGccep8N+F4CS6las7hRRxMTErQIfkiQqr1FUTIy5pLhoa3UrVnkES7DaJguJuYGri8gwSjxucXNBQe6hqlaq6hosWnjwbICLIjKKKLMZr6Oag5RuwCyWpMkQaBTwsogMQkLebbHYRle1jl76IhMttiPgtRdRdU45HfZWAC5rdWoewRKtyePAcBHVRLrFYvsvvU7tU0TJew2JakoCT0HnVe4+AUtISGkN4A7VRREZSHqC1TZBq8MnYMLsmai+HiKDkXhEq7lywAQkNJNIRPoE0MliSbm1cnuFgFmt1k7g5AaRX6RwT67cViFgHph6Bq8cIoORIgNAdPmmiqeIHsmAEfnParEkdyvfUD5g5qtffkdEfpP9yy95AxYfb2sDfrMkUZ1IiV+WX/YGTESINsEvh8hgBNrHpaR47+H1Bswk0TY0FREZS0SJp1PZz96ASSl5BCMKAClkx7Kfy09ytAhBLUSGIwR8AyYEJziIAkKKVmU//nSKCCSEphoiw0kq+6H8KSIDRhQY3rPB8gGLD0EhRAYkNAOm+cAYEdWW9N6P6NfXFxFRzTBgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECjFgRAoxYEQKMWBECkWEuoBwMnHCeNw3Ybxm30PTZuDEiWyf9vT4KPS/MR62aDP25xYh62wB3FIqrpQChQHTEBUVhQ1r30N8fIJP34rMVXjhny/5NW6D1BvQqVMHzb6Y6FiftoE3JmBO18aoF/HTicbWcwUY+dFphuw6wVNEDQMG9EP79u2Rnt7E58+vJk9CdHS08hosUWbMurNRhXABQK+G8bi/VZLy/VNgMGAaJmaM1e1LSkpC//59ldfQOTkWtmjtE4zejeKV758CgwGrJD29Cbp2uavKdSaM1w9goMSYhG5fbBV9dG1hwCqZmDEWJlPV/1u6d+uCpk3Tldax116IYrdHs29XziWl+6bAYcDKiYyMxJjRoyq0/eHJP+OBh6Zj1+dfeNuEEBg3ZlTlzQPqXGEp/rrvgk/7CVcJXj2Yq3TfFDgMWDn9+vXBDTfUr9BmMglkZW1C61YtK7SPGzsaERFqJ2FfOZSD0dtOY/nJfGw5W4AXDlxAn6yTuFiqfWSjaw+n6cuZmDHOp23kiHvw44/nYbPZKrSnpt6A3j17IGvTZqU1ZZ1xIeuMS+k+SB0ewa5KS2uMu7t39Wnv3PkWTJ/6kOY246uYbSQCeATzyhg3RnNyIz8/H9t37MTPf36rT1+fXj3QIDUVP54/H/B6YmNj0KdPb82+E8dP4tuDB6/U0LsnYuPiNNf78suvcO7cOd19JCUloWtX7RlTd2kp1q3P0uwzmUy468470LXLnWjRvBmsSVZcuJCDcz/+iC1btuHzL3bD7Xaj3U03oUXL5ppjrFmzVrcuI2HAAERERGDsWO1Ji/feX40lS5fjNw9PgxBCc7uXXv5PwGtKTk7GnDdnafa9OXsu/vLMlYD169sbk+6boLnea2/Mxsz/eU53H2NHj8QzTz+l2bd23QbNgA0bNgRPPfEY0tObaG43Y9oUZGefwuNPPIXu3btixrQpmuulhknAeIqIK0eihg0aaPatWPkesrNP4csvv9LsHz92dLXT+iotWLhEt2/wwF9Wue2woYN1++bMnV9hOSoqCq/95yXMfv1V3XCVado0HcuXLsbPO/se9cMNAwYgQ2NyAwCOHz+JPXv2AgAyV72vuU5NPphW6duDB7F79x7NviZN0nTvfUxLa4ybb+6k2Xfwu++wY+cu77LZbMbct17HvSOG16q2TZu2Yu26DbXaxmjCPmCNGjVC7149NPuWZ670/vz+B2tQUlKiud6E8WMUVFZzCxYt1u0bMmigZvvQwYN8TnnLzJu3sMLy73/7CPr11b4erM7MZ5/T/f8WDsI+YOPHjYbZbPZp93g8yFz5nnc5Pz8fW7Zu0xxjwIB+PtP4wbTmw3Ww2+2afYN0ThP1Tg8dDgcyV67yLrds0RwzpmtfR9XEqVOn8eUe7dPrcBDWATObzRg/drRm367Pv8APP5yp0LaiXODKi46OxqiR9wS8vpoqKirGu8tWaPa1aNEM7W66qUJb06bp+NnPOmqu/867y1BYWORdnjFjKqKionT3ff78/+HlV2bhwakP49dTZuDfL73qnVW98cZGAID9+7+p1d/HSMI6YD17dPf+I6hs+fKVPm2bN2+Fw+HQXD8jCDcAV2XhoiXweLTv8Bg8aECF5SGDB2mu53a78fb8Rd7l6OhoDNVZFwC279iJbj364rnnX8AHH6zB6tUf4vl//BPd7u6L7Tt2olPHK9d/BQUFtf3rGEZYB2yCztPFhYVF+HDtep/24uJirNaZXm7TuhVuu61zQOurjezsU/j4k880+wYPrngdNnyo9nXZxs1bcfr0997lW2+5GfXqaX/GduFCDh54cLrmLxyn04lfPzQDDRs20Dz9DidhG7AGqano27unZt/6DVlw6fzWzVypPZsIXAtHsXc029u0buW9l7J586bo0EF7ZnHevAUVltu2baO7ryXvLtO97gOA3NxcrFu/ES1baH/QHC7C9oPmsWNHISIiAqWlpRWmpAHg4KHD6N7N97YpABAC+Gz7jgqnY7YkKzp06IBhQwbjz3+eqRtO1TZu2oJz586hYcOGPn2DBw/Ev/79CoYO0Z7cOHzkKD79bHuFtuRk/Ymbr77aW209+/bvQ8eO2mEOF2EZMJPJhIxxV6bWLxUWYtSYn+6ESE29AXu/3Fnlqc3//v3FCndv9Op5N959ZwHi4mIxYsRwLFioP22uUmlpKRYvWYbHfveoT9/gQQPwr3+/gmFDta+p5r29ELLSez6iIiN19+V0Vf9LxOV0ITExsdr1jCwsTxG7d+uCJk3SNPvuvWd4tdcNI+/VnzEMxtPOVVm8+F2Ulpb6tLdv1w79+/bxmVEEAIfTiRWZvpM6BRcv6u6nsc7kUHmNbmyEAwe+rXY9IwvLgOm9Og0ARo2qfrq9VcsWundBdOrUAR06tPe7trr68fx5ZGVt0uz741OPa7YvW5aJixd9n5I+/f0PuvsZOKjq27AAoHv3bjh6/Hi16xlZ2AWsfv0U9OvXR7Ovffv2mr/htYwcMUK3L9R3dsxfqD3Z8dqsN33aPB4P5s1foLE2sH//ft19DOjXB310JokAoH/fPkitX1/zaBpOwi5gY0aPQqTOtcWYUfqhqeye4UN0n2geMWI4YmNj/KovED79bDuOHz9Zoe3wkaNYnrmqwjQ8AGzZug0nT57SHOfEiWwcPaZ9BBJCYM5br2PihPEVPoiOiIjAfRMzMPvNWTjwTfh+wFwmrCY5hBA+10ixMTGY8+YslJa6sfK997G7Frf1/ObhaWjXtg3qV3rNgCUxEUMGDcTyzFU6W6olpcTCxe9g5tN/8ratXrMWUkp8uG49pk150Ns+d978Kseav2Ah/vbsTM2+2JgYvPiP5/CnPz6O7w4fgcfjQbub2sJqtQIATp++corZpJq7740srALWtctdaNas4tugIiMjMWTIIGze8hE2bd5aq/GGDx+KPzz2W82+jIyxIQsYACxdlokn/vB7xMbEYP6CRXC5XJgxfWqFeyaPHT+BbR9/WuU4i99Zil/dfz+aN2+qu47VasUdt/9Cs08Igc633OLX38EIwuoUsaoXivoThqysjbqfed3+i9vQqmWLWo8ZKPn5+fhg9YcoKirGi/96GVkbN2PalAcwdvRI7zpvz1/gMzVfWVFRMWY88t8oLi72q44B/fuiRYtmfm1rBGETsOTkZAwY0E+zz+lyYaPOzFtVCguLdJ93EkJgfKgfY1m4GMtXZOLChRxkZ5/CpMkPoqjoSlBcBQVYujSzRuPs2bMXU2c8WuvHTlIbpOLZmX+pdd1GEjYBGz1yhO475VevWYvCoiLNvuqsWKF/5Bsz6t4q70RXbd++A1iydLl3effuPXj40d9BSolly1ZW+TlXZWvXrsfI0Rk4c+ZsjdY/fOQo0tIaIy2tca3rNpKwuQbr1q0LTp06rdm3bHnNfpNr2bFzF77+ej+Skqya/Xfc/gt88umVm3AdDoduDZcvVzw6uEvduuva8/JqVNvAgQPQo3tX7N27z9u2evWHaJKWhg0btF9oU5XPv9iNLt16YdKkCRg3bjTatm7ts853R45gxfJVeGvu2/j1A5PRror7GcOB95HWRIuN34djMBvXr9F87uujbZ9g7Pj76jx+SkoyWrdqhYT4eOQ58vHDD2dx9mzNjnBG53TYBRBGR7Bw071bV92HKqubmq+pnJxc5OTwNd5VCZtrsHCj95h/dvYp3VcfUOAxYAbUvl07dO/WRbPv7QWLdJ98psBjwAzokYenar4xqrCwCEuX+T+hQ7XHgBlMkyZpGKRzp3vmylXIz88PckXhjQEzmOlTH9S9CXne24s020kdBsxAUlKSMUbniwF37NyFg4cOBbki4jS9gfTu2QNHjxzT7HvjjTlBroYAftBMpETZB808RSRSiAEjUogBI1KIASNSiLOIQZIYacZjHVPQpF7ong8DgOyCErz4zQW4LvN2qWBgwILkrbtuxIDGCaEuAwDQKjEa4z/WftaMAouniEHSp1F8qEvw6nsN1WJ0DFiQHMjz76UxKhzI8+/1CFR7PEUMkl9t/x7/vK0hmiWE9hrshKsEv9t9LqQ1hBPeyUGkAO/kIAoCBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEghBoxIIQaMSCEGjEihcgET185XMBJd137KUrmAyfxQlEJkPNJV9lP5U0RHCCohMiLNgPEIRhQAUjNgQhwNSTVEBmMqd7DyBkxIzzehKYfIcI6V/eANmJQ4EJpaiIzFA3m47GdvwC5Hmr4OTTlEBiNMvgErzM09A+BQSAoiMhI3fAMGAJDYEPRiiIzF7nLlHilbqHyrVFaQiyEyFAl8BMBTtlwhYE5n4sfgB85EfhNSbCu/XOkIll0EiHeDWA+RoXg82FJ+2eduegExJ3jlEBmJPFZQkPtd+RafgDkcOXsAsTd4RREZhBSLAMjyTZrPg0nIWUEpiMg4pBDuxZUbhc7KkYkW22EAzdTWRGQQEp85nfZulZv1nmi+LCD/rrgkIgORb2i16h3BACAq0WI7BiBNTUFERiGPOR15bQG4K/dU9U6OEkj5hLqiiIxBQjwPjXABVR/BAAAJlqStAqJnwKsiMobTToe9FYASrc7q3yrlMU/hC3GIdEj5JHTCBQDm6rYvKbmUGxUTEycgfGZIiMKZhNzmcuY9VtU61Z4iXhWZaLF9CuD2updFZAilbpO89WJeXpUPKtf0xaOXIc0TARTUvS6i65+EfKG6cAE1OEUsU1x8yR4VG3dWAMPrVhrRde8LlyNvEnRmDsurccAAoKSocF90TFwqgNv8rYzoOmc3CU+foqIie01WrlXAAKC4uHBDdHTcLRBoU/vaiK5rUgqR4czP+7ymG/jz5Q/uqCiRIYF9fmxLdN0SkE+68nPfr902frLZbGmlbnwCoKm/YxBdNyRedjrtj9Z2M78DBpSFTG4FRMu6jEN0jVvqdNgzUO5dGzVVp+8Hs9vt30eYRU8AfO02GdVSp8M+CX6ECwjAF/DZ7fYfSiNNPSSwv65jEV1TJF6+euTSvRWqOgH5hstLOTlnY6LMXSDlB4EYjyjEpIB88uo1l19HrjK1nqbXc+nSpZLi4qJl0bGxAHA36nh9RxQiDgFMdDjyZgdisIAFrExxUeG2mJjYgwB6AYgL9PhECu0yCU8fhyNvZ6AGVHaUiYtLaRgR6ZkDYKCqfRAFyGUJ+aLLkfc0gMuBHFj1aZywWGwPSOAFABbF+yKqNQm5TbrF9IIC+0EV4wflOikhISFFmCOehhQPAYgMxj6JqnEaUv7R6cxbgkrvMgykoE5EJCSktDaZ3H+XEMOCvW+iK+QxCfG8y2FfhDpMv9dUSP6Rx8fb2pnM4mFATgRQLxQ1UFiRkNgOyDeczrylqMFjJoES0qOI1Wq1umGaLKTMAMQtoa6HjEYegxSLhHAvdjgcJ0JRwTXzD9pms6WVlsohEGIYgO4AYkJdE1137BLYJqT4yOORW1VNXNTGNROwSiLibbY2plLZSQrTz4SQHSCRgiszkdarfxjA8FKCK6+syJeAS0i4hMBhD+QRCNMRuMUhlyvnKOp45wUREREBwP8D3BwJN/WzqtsAAAAASUVORK5CYII=")

def _render_document_bytes(
    title: str,
    content_md: str,
    target_format: str,
    extra_tables: Optional[List[List[List[str]]]] = None,
    include_notice: bool = False,
) -> Tuple[bytes, str, str]:
    fmt = (target_format or "pdf").strip().lower().lstrip(".")
    if fmt in ("word", "doc"):
        fmt = "docx"
    elif fmt in ("excel", "xls"):
        fmt = "xlsx"
    elif fmt in ("text", "plain", "txt"):
        fmt = "txt"
    elif fmt not in ("pdf", "docx", "xlsx", "txt"):
        fmt = "pdf"

    clean_title = _strip_md_inline(title or "Документ Алии")[:120] or "Документ Алии"
    stem = _safe_doc_stem(clean_title)
    blocks, md_tables = _parse_markdown_blocks(content_md or "")
    if include_notice:
        # Точный служебный блок может быть уже в ответе; итоговое предупреждение добавляем в конце.
        notice = "алия может ошибаться. пожалуйста, проверяйте важные документы"
        blocks = [(kind, val) for kind, val in blocks if not (
            kind == "p" and _strip_md_inline(str(val)).strip().rstrip(".").casefold() == notice
        )]
    # Удаляем первый заголовок при совпадении с заголовком документа (включая «Иншо: ...», «Реферат: ...»).
    def heading_key(value: str) -> str:
        value = re.sub(
            r"(?iu)^\s*(?:иншо|сочинение|эссе|реферат|доклад|маъруза|essay|report)\s*(?:[:：\-—]|дар\s+бораи|на\s+тему|по\s+теме)?\s*",
            "",
            _strip_md_inline(value),
        )
        return " ".join(re.findall(r"[^\W_]+", value.casefold(), flags=re.UNICODE))

    if blocks and blocks[0][0] in ("h1", "h2", "h3", "p"):
        first_key = heading_key(str(blocks[0][1]))
        title_key = heading_key(clean_title)
        if first_key and title_key and (
            first_key == title_key
            or (blocks[0][0] in ("h1", "h2") and (first_key in title_key or title_key in first_key))
        ):
            blocks = blocks[1:]
    all_tables = md_tables if md_tables else (extra_tables or [])

    if fmt == "txt":
        txt_lines: List[str] = [clean_title, "=" * min(64, max(12, len(clean_title))), ""]
        for kind, val in blocks:
            if kind == "table_ref":
                t_idx = int(val)
                if 0 <= t_idx < len(md_tables):
                    t_rows = md_tables[t_idx]
                    col_n = max((len(r) for r in t_rows), default=0)
                    widths = [
                        max((len(r[c]) if c < len(r) else 0 for r in t_rows), default=4)
                        for c in range(col_n)
                    ]
                    for r_i, r_vals in enumerate(t_rows):
                        padded = [
                            (r_vals[c] if c < len(r_vals) else "").ljust(widths[c])
                            for c in range(col_n)
                        ]
                        txt_lines.append(" | ".join(padded))
                        if r_i == 0:
                            txt_lines.append("-+-".join("-" * w for w in widths))
                    txt_lines.append("")
            elif kind in ("h1", "h2", "h3"):
                txt_lines.extend(["", val, "-" * min(48, max(8, len(val)))])
            elif kind == "bullet":
                txt_lines.append(f"• {val}")
            elif kind == "code":
                txt_lines.extend(["", val, ""])
            else:
                txt_lines.append(val)
        if include_notice:
            txt_lines.extend(["", "---", "Алия может ошибаться. Пожалуйста, проверяйте важные документы."])
        raw_txt = ("\n".join(txt_lines).strip() + "\n").encode("utf-8")
        return (raw_txt, f"{stem}.txt", "text/plain; charset=utf-8")

    if fmt == "docx":
        import docx
        from docx.shared import Pt, RGBColor

        doc = docx.Document()
        style_normal = doc.styles["Normal"]
        style_normal.font.name = "Arial"
        style_normal.font.size = Pt(11)

        h_main = doc.add_heading(clean_title, level=0)
        for run in h_main.runs:
            run.font.color.rgb = RGBColor(0x16, 0x18, 0x1E)

        rendered_tbl_indices = set()
        for kind, val in blocks:
            if kind == "table_ref":
                t_idx = int(val)
                if 0 <= t_idx < len(md_tables):
                    rendered_tbl_indices.add(t_idx)
                    rows_data = md_tables[t_idx]
                    cols_n = max(len(r) for r in rows_data)
                    tbl = doc.add_table(rows=len(rows_data), cols=cols_n)
                    tbl.style = "Table Grid"
                    for r_i, r_vals in enumerate(rows_data):
                        for c_i in range(cols_n):
                            cell_txt = r_vals[c_i] if c_i < len(r_vals) else ""
                            cell = tbl.cell(r_i, c_i)
                            cell.text = cell_txt
                            if r_i == 0:
                                for run in cell.paragraphs[0].runs:
                                    run.bold = True
                    doc.add_paragraph("")
            elif kind == "h1":
                doc.add_heading(val, level=1)
            elif kind == "h2":
                doc.add_heading(val, level=2)
            elif kind == "h3":
                doc.add_heading(val, level=3)
            elif kind == "bullet":
                doc.add_paragraph(val, style="List Bullet")
            elif kind == "code":
                p_code = doc.add_paragraph()
                r_code = p_code.add_run(val)
                r_code.font.name = "Courier New"
                r_code.font.size = Pt(9.5)
            else:
                doc.add_paragraph(val)

        if not md_tables and extra_tables:
            for rows_data in extra_tables[:10]:
                if not rows_data:
                    continue
                cols_n = max(len(r) for r in rows_data)
                tbl = doc.add_table(rows=len(rows_data), cols=cols_n)
                tbl.style = "Table Grid"
                for r_i, r_vals in enumerate(rows_data):
                    for c_i in range(cols_n):
                        cell = tbl.cell(r_i, c_i)
                        cell.text = r_vals[c_i] if c_i < len(r_vals) else ""
                        if r_i == 0:
                            for run in cell.paragraphs[0].runs:
                                run.bold = True

        if include_notice:
            from docx.shared import Inches
            notice = doc.add_paragraph()
            notice.paragraph_format.space_before = Pt(12)
            notice.add_run().add_picture(io.BytesIO(_ALIYA_DOCUMENT_ICON), width=Inches(0.25))
            note_run = notice.add_run("  Алия может ошибаться. Пожалуйста, проверяйте важные документы.")
            note_run.font.size = Pt(9)
            note_run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
        out = io.BytesIO()
        doc.save(out)
        return (
            out.getvalue(),
            f"{stem}.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    if fmt == "xlsx":
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = clean_title[:28].replace("/", "-") or "Алия"

        header_fill = PatternFill(start_color="1E222B", end_color="1E222B", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=11)
        body_align = Alignment(wrap_text=True, vertical="top")

        if all_tables:
            row_cursor = 1
            ws.cell(row=row_cursor, column=1, value=clean_title).font = Font(bold=True, size=14)
            row_cursor += 2
            for t_rows in all_tables:
                for r_i, r_vals in enumerate(t_rows):
                    for c_i, v in enumerate(r_vals, start=1):
                        cell = ws.cell(row=row_cursor, column=c_i, value=v)
                        cell.alignment = body_align
                        if r_i == 0:
                            cell.fill = header_fill
                            cell.font = header_font
                    row_cursor += 1
                row_cursor += 1
        else:
            ws.cell(row=1, column=1, value="№").fill = header_fill
            ws.cell(row=1, column=1).font = header_font
            ws.cell(row=1, column=2, value="Раздел / Пункт").fill = header_fill
            ws.cell(row=1, column=2).font = header_font
            ws.cell(row=1, column=3, value="Содержание").fill = header_fill
            ws.cell(row=1, column=3).font = header_font
            cur_sec = clean_title
            r_idx = 2
            item_no = 1
            for kind, val in blocks:
                if kind in ("h1", "h2", "h3"):
                    cur_sec = val
                else:
                    if ":" in val and len(val.split(":", 1)[0]) <= 45:
                        k_part, v_part = val.split(":", 1)
                        ws.cell(row=r_idx, column=1, value=item_no)
                        ws.cell(row=r_idx, column=2, value=k_part.strip()).alignment = body_align
                        ws.cell(row=r_idx, column=3, value=v_part.strip()).alignment = body_align
                    else:
                        ws.cell(row=r_idx, column=1, value=item_no)
                        ws.cell(row=r_idx, column=2, value=cur_sec).alignment = body_align
                        ws.cell(row=r_idx, column=3, value=val).alignment = body_align
                    r_idx += 1
                    item_no += 1

        for col_cells in ws.columns:
            max_len = max((len(str(c.value or "")) for c in col_cells), default=12)
            col_letter = col_cells[0].column_letter
            ws.column_dimensions[col_letter].width = max(12, min(58, max_len + 4))

        out = io.BytesIO()
        wb.save(out)
        return (
            out.getvalue(),
            f"{stem}.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    # Формат PDF (с полной поддержкой таджикской и русской кириллицы через системный DejaVuSans.ttf)
    from fpdf import FPDF

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()

    reg_ttf, bold_ttf = _find_unicode_ttf_pair()
    font_family = "Helvetica"
    if reg_ttf:
        pdf.add_font("AliyaSans", style="", fname=reg_ttf)
        pdf.add_font("AliyaSans", style="B", fname=bold_ttf or reg_ttf)
        font_family = "AliyaSans"

    # Фирменная кораллово-оранжевая акцентная полоса сверху страницы
    pdf.set_fill_color(255, 106, 61)
    pdf.rect(16, 12, 26, 1.4, style="F")
    pdf.ln(3)

    pdf.set_font(font_family, "B", 16)
    pdf.set_text_color(22, 24, 30)
    pdf.multi_cell(0, 8.5, clean_title)
    pdf.ln(3)

    for kind, val in blocks:
        if kind == "table_ref":
            t_idx = int(val)
            if 0 <= t_idx < len(md_tables):
                t_rows = md_tables[t_idx]
                pdf.set_font(font_family, "", 9.5)
                try:
                    with pdf.table() as table:
                        for r_vals in t_rows:
                            row = table.row()
                            for c_val in r_vals:
                                row.cell(c_val)
                except Exception:
                    for r_vals in t_rows:
                        pdf.multi_cell(0, 6, " | ".join(r_vals))
                pdf.ln(3)
        elif kind == "h1":
            pdf.ln(2)
            pdf.set_font(font_family, "B", 13.5)
            pdf.set_text_color(30, 34, 43)
            pdf.multi_cell(0, 7.5, val)
            pdf.ln(1)
        elif kind in ("h2", "h3"):
            pdf.ln(1.5)
            pdf.set_font(font_family, "B", 11.8)
            pdf.set_text_color(42, 46, 56)
            pdf.multi_cell(0, 6.8, val)
            pdf.ln(1)
        elif kind == "bullet":
            pdf.set_font(font_family, "", 10.8)
            pdf.set_text_color(35, 38, 45)
            pdf.multi_cell(0, 6.2, f"•  {val}")
            pdf.ln(0.8)
        elif kind == "code":
            pdf.set_font(font_family, "", 9.2)
            pdf.set_fill_color(244, 245, 248)
            pdf.set_text_color(24, 28, 36)
            pdf.multi_cell(0, 5.2, val, fill=True)
            pdf.ln(1.8)
        else:
            pdf.set_font(font_family, "", 10.8)
            pdf.set_text_color(35, 38, 45)
            pdf.multi_cell(0, 6.2, val)
            pdf.ln(1.6)

    if include_notice:
        pdf.ln(5)
        if pdf.get_y() > pdf.h - 28:
            pdf.add_page()
        x, y = pdf.l_margin, pdf.get_y()
        pdf.image(io.BytesIO(_ALIYA_DOCUMENT_ICON), x=x, y=y, w=8, h=8)
        pdf.set_xy(x + 10, y)
        pdf.set_font(font_family, "", 9)
        pdf.set_text_color(95, 95, 95)
        pdf.multi_cell(pdf.w - pdf.r_margin - (x + 10), 5, "Алия может ошибаться. Пожалуйста, проверяйте важные документы.")
    raw_pdf = bytes(pdf.output())
    return (raw_pdf, f"{stem}.pdf", "application/pdf")


@router.post("/v1/document/analyze")
def analyze_document(req: DocumentAnalyzeRequest):
    if not req.file_base64 or len(req.file_base64) > 28_000_000:
        return {"reply": "", "error": "invalid_or_too_large_document"}
    try:
        raw_bytes = base64.b64decode(req.file_base64.strip(), validate=False)
    except Exception:
        return {"reply": "", "error": "invalid_base64"}

    try:
        extracted_text, _, unit_count = _extract_document_text_and_tables(raw_bytes, req.file_name)
    except Exception as exc:
        logging.warning("Document parse failed (%s)", type(exc).__name__)
        return {"reply": "", "error": "document_parse_failed"}

    if not extracted_text.strip():
        return {"reply": "", "error": "empty_document_text"}

    # Контракт Android: сначала вернуть извлечённый текст; вопрос по нему
    # приложение отправляет отдельно в чат. Не тратим второй запрос к модели.
    return {
        "ok": True,
        "extracted_text": extracted_text[:28_000],
        "char_count": len(extracted_text),
        "pages_or_sheets": unit_count,
    }


@router.post("/v1/document/generate")
def generate_document(req: DocumentGenerateRequest):
    content = (req.content_markdown or "").strip()
    if not content:
        return {"ok": False, "error": "empty_content"}
    try:
        doc_bytes, out_name, mime_t = _render_document_bytes(
            title=req.title,
            content_md=content,
            target_format=req.target_format,
            include_notice=True,
        )
        return {
            "ok": True,
            "file_name": out_name,
            "mime_type": mime_t,
            "size_bytes": len(doc_bytes),
            "file_base64": base64.b64encode(doc_bytes).decode("ascii"),
        }
    except Exception as exc:
        logging.warning("Document generation failed (%s: %s)", type(exc).__name__, exc)
        return {"ok": False, "error": f"generation_failed:{type(exc).__name__}"}


@router.post("/v1/document/convert")
def convert_document(req: DocumentConvertRequest):
    if not req.file_base64 or len(req.file_base64) > 28_000_000:
        return {"ok": False, "error": "invalid_or_too_large_document"}
    try:
        raw_bytes = base64.b64decode(req.file_base64.strip(), validate=False)
        extracted_text, tables, _ = _extract_document_text_and_tables(raw_bytes, req.file_name)
    except Exception as exc:
        return {"ok": False, "error": f"parse_failed:{type(exc).__name__}"}

    if not extracted_text.strip() and not tables:
        return {"ok": False, "error": "empty_source_document"}

    base_stem = os.path.splitext(os.path.basename(req.file_name or "Document"))[0] or "Document"
    final_md = extracted_text
    instr = (req.instruction or "").strip()
    # Если пользователь попросил не просто конвертировать формат, а перевести или отредактировать текст перед сохранением
    if instr and re.search(r"(?iu)\b(перевед|тарҷума|translate|сократ|исправ|оформ|резюм|хулоса)\w*", instr):
        edit_res = chat(
            ChatRequest(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Исходный документ «{req.file_name}»:\n---\n{extracted_text[:24000]}\n---\n\n"
                            f"Выполни просьбу пользователя и верни готовый чистый текст документа с заголовками Markdown: {instr}"
                        ),
                    }
                ],
                temperature=0.3,
                max_tokens=1400,
                reasoning_mode="high",
            )
        )
        if edit_res.get("reply"):
            final_md = edit_res["reply"]

    try:
        doc_bytes, out_name, mime_t = _render_document_bytes(
            title=base_stem,
            content_md=final_md,
            target_format=req.target_format,
            extra_tables=tables,
            include_notice=True,
        )
        return {
            "ok": True,
            "file_name": out_name,
            "mime_type": mime_t,
            "size_bytes": len(doc_bytes),
            "file_base64": base64.b64encode(doc_bytes).decode("ascii"),
        }
    except Exception as exc:
        logging.warning("Document convert failed (%s: %s)", type(exc).__name__, exc)
        return {"ok": False, "error": f"convert_failed:{type(exc).__name__}"}


app = FastAPI(title="Aliya Cloud Gateway v1.0.0 (Sharipov)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


def _launch_gateway() -> None:
    """
    Запуск облачного шлюза Алии v1.0.0 (Gradio + FastAPI на одном порту для совместимости с ZeroGPU).
    """
    port = int(os.environ.get("PORT", os.environ.get("GRADIO_SERVER_PORT", "7860")))
    print(
        f"[Aliya Gateway] v1.0.0 стартует на порту {port}; gradio={'да' if gr is not None else 'нет'}",
        flush=True,
    )

    if gr is None:
        import uvicorn

        uvicorn.run(app, host="0.0.0.0", port=port)
        return

    with gr.Blocks(title="Aliya Cloud Gateway v1.0.0") as demo:
        gr.Markdown(
            "## Алия — Облачный сервис v1.0.0 ✅\n"
            "- **Разработчик:** Sharipov\n"
            "- **Поддерживаемые языки:** Тоҷикӣ (кириллица, порсӣ, лотинӣ) · Русский · English\n"
            "- **Активные модули:** Чат и рассуждение (`/v1/chat/stream`, `/v1/chat`) · "
            "Документы Word / PDF / Excel / TXT (`/v1/document/*`) · "
            "Анализ и генерация изображений (`/v1/vision`, `/v1/image`) · "
            "Голосовой ввод и озвучка (`/v1/stt`, `/v1/tts`)\n"
            "- **Проверка готовности:** `/health`"
        )

    # launch() в разных версиях gradio принимает разные наборы аргументов —
    # пробуем по очереди, а не падаем с TypeError.
    launched = None
    last_error: Exception | None = None
    for kwargs in (
        {"server_name": "0.0.0.0", "server_port": port, "ssr_mode": False, "prevent_thread_lock": True},
        {"server_name": "0.0.0.0", "server_port": port, "prevent_thread_lock": True},
        {"prevent_thread_lock": True},
    ):
        try:
            launched = demo.launch(**kwargs)
            break
        except TypeError as exc:
            last_error = exc
            continue
    if launched is None:
        raise RuntimeError(f"Не удалось запустить Gradio-интерфейс шлюза Алии: {last_error}")

    # Маршруты Алии живут на том же приложении, что и страница-статус.
    fastapi_app = launched[0] if isinstance(launched, (tuple, list)) else getattr(demo, "app", app)
    try:
        fastapi_app.router.routes[0:0] = list(router.routes)
    except Exception as exc:  # pragma: no cover - защита от смены внутренностей gradio
        print(f"[Aliya Gateway] не удалось подключить маршруты к Gradio: {exc}", flush=True)
    print("[Aliya Gateway] шлюз готов: /health, /v1/chat, /v1/vision, /v1/image, /v1/tts", flush=True)
    demo.block_thread()


# На Hugging Face Space файл запускают как скрипт, но переменная SPACE_ID выставлена всегда —
# поэтому запускаемся в обоих случаях. При обычном `import app` (локальные тесты) сервер не поднимается.
if __name__ == "__main__" or os.getenv("SPACE_ID"):
    _launch_gateway()
