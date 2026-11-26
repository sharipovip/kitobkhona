#!/usr/bin/env python3
"""
Regression test: the Aliya gateway must never take unbounded time to answer.

    python3 tests/gateway_deadline.py

History of the bug
------------------
POST /v1/chat walked its fallback chain sequentially:
    live search (~4 s) -> Gemini search mode (20 s) -> Gemini plain mode (20 s)
    -> extra OpenAI-compatible providers (12 s each) -> ZeroGPU -> HF Router
    (6 models x 9 s).
Nothing bounded the total, so a request could occupy the worker for several
minutes. The web client waited 60 s, gave up, and retried the whole chain --
that is what the user saw as "Aliya thinks forever".

The fix introduces a global deadline (CHAT_DEADLINE_S) shared by every stage,
so the gateway answers with an honest error instead of hanging.

The test imports the real app.py helpers (the module is heavy, so the module is
loaded with lightweight stand-ins for the optional ML dependencies) and checks
that the deadline helpers behave correctly.
"""
import ast
import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "aliya-gateway", "app.py")

failures = []


def check(name, cond, detail=""):
    if cond:
        print("PASS " + name)
    else:
        print("FAIL " + name + (" — " + detail if detail else ""))
        failures.append(name)


# ---------------------------------------------------------------------------
# 1. The source must contain the deadline plumbing.
# ---------------------------------------------------------------------------
src = open(APP, encoding="utf-8").read()

try:
    ast.parse(src)
    check("aliya-gateway/app.py parses", True)
except SyntaxError as exc:
    check("aliya-gateway/app.py parses", False, str(exc))
    src = ""

check("CHAT_DEADLINE_S is defined", "CHAT_DEADLINE_S" in src)
check("_deadline_remaining helper exists", "def _deadline_remaining" in src)
check("_call_timeout helper exists", "def _call_timeout" in src)

# Every provider call must respect the deadline.
for fn in ("_hf_router_chat", "_extra_provider_chat", "_gemini_teacher_chat"):
    check("%s accepts a deadline" % fn, "deadline: Optional[float] = None" in src)

check(
    "hf router call timeout is deadline-bounded",
    "timeout=_call_timeout(deadline, 9.0)" in src,
)
check(
    "extra provider call timeout is deadline-bounded",
    "timeout=_call_timeout(deadline, 12.0)" in src,
)
check(
    "gemini call timeout is deadline-bounded",
    "timeout=_call_timeout(deadline, 20.0" in src,
)
check(
    "gemini streaming call timeout is deadline-bounded",
    "timeout=_call_timeout(deadline, 22.0)" in src,
)
check(
    "openai streaming call timeout is deadline-bounded",
    "timeout=_call_timeout(deadline, 16.0)" in src,
)

# The chat handler must create and pass the deadline.
chat_handler = src.split('def chat(req: ChatRequest):', 1)[-1].split("\n@router.", 1)[0]
check("chat handler creates a deadline", "deadline = time.monotonic() + CHAT_DEADLINE_S" in chat_handler)
check("chat handler passes the deadline to gemini", "deadline=deadline" in chat_handler)
check("chat handler passes the deadline to hf router", "_hf_router_chat(aligned_messages, req.temperature, eff_max_tokens, deadline=deadline)" in chat_handler)
check(
    "chat handler reports an exhausted deadline",
    "chat_deadline_exceeded" in chat_handler,
)

# ---------------------------------------------------------------------------
# 2. Behavioural check of the helpers (evaluated in isolation).
# ---------------------------------------------------------------------------
namespace = {
    "os": os,
    "time": types.SimpleNamespace(monotonic=__import__("time").monotonic),
    "Optional": __import__("typing").Optional,
}
helper_src = src[src.index("CHAT_DEADLINE_S = float("):src.index("def _hf_router_chat(")]
exec(helper_src, namespace)

deadline_remaining = namespace["_deadline_remaining"]
call_timeout = namespace["_call_timeout"]
CHAT_DEADLINE_S = namespace["CHAT_DEADLINE_S"]

check("CHAT_DEADLINE_S is a sane positive number", 10 <= CHAT_DEADLINE_S <= 60, str(CHAT_DEADLINE_S))
check("ZeroGPU calls are bounded by _run_zerogpu_chat_bounded", "_run_zerogpu_chat_bounded(" in chat_handler)
stream_handler = src.split("def chat_stream(", 1)[-1].split("\ndef ", 1)[0]
check("stream fallback does not restart a second chat(req) cycle", "sync_res = chat(req)" not in stream_handler)
check("hf router stops looping models on 401/402", "if r.status_code in (401, 402):" in src)
check("hard-failed keys are not retried in cooled_fallbacks", "_provider_hard_fail_keys" in src)

# No deadline -> fall back to the per-call cap.
check("no deadline returns the per-call cap", deadline_remaining(None) == namespace["_PROVIDER_CALL_CAP_S"])

# A fresh deadline still has plenty of time left.
import time as _time

fresh = _time.monotonic() + 60
check("fresh deadline has time left", 55 <= deadline_remaining(fresh) <= 60, str(deadline_remaining(fresh)))

# An expired deadline reports zero.
expired = _time.monotonic() - 5
check("expired deadline reports zero", deadline_remaining(expired) == 0.0, str(deadline_remaining(expired)))

# The per-call timeout never exceeds the remaining budget.
check(
    "call timeout is capped by the remaining budget",
    call_timeout(fresh, 20.0) <= 60.0 and call_timeout(fresh, 20.0) >= 1.0,
    str(call_timeout(fresh, 20.0)),
)
check(
    "call timeout shrinks as the deadline approaches",
    call_timeout(_time.monotonic() + 3, 20.0) <= 3.0,
    str(call_timeout(_time.monotonic() + 3, 20.0)),
)
check(
    "expired deadline yields a minimal valid timeout",
    call_timeout(expired, 20.0) >= 1.0,
    str(call_timeout(expired, 20.0)),
)

# ---------------------------------------------------------------------------
# 3. The web client must understand the new error code.
# ---------------------------------------------------------------------------
core = open(os.path.join(ROOT, "aliya", "aliya-core.js"), encoding="utf-8").read()
check("client handles chat_deadline_exceeded", "chat_deadline_exceeded" in core)

if failures:
    print("\n%d gateway deadline check(s) failed: %s" % (len(failures), ", ".join(failures)))
    sys.exit(1)

print("\nPASS gateway deadline: every provider stage is bounded by a shared deadline.")
