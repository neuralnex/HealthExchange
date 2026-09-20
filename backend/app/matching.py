"""Demographic matcher: Jaro-Winkler + weighted identifiers.

NIN + DOB auto-links. Name alone never auto-merges.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

MatchBand = Literal["auto-link", "confirm", "workbench", "no-match"]


def _normalize(value: str | None) -> str:
    text = (value or "").lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def _digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def jaro_winkler(a_raw: str, b_raw: str) -> float:
    s1 = _normalize(a_raw).replace(" ", "")
    s2 = _normalize(b_raw).replace(" ", "")
    if not s1 and not s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    if s1 == s2:
        return 1.0

    match_distance = max(0, max(len(s1), len(s2)) // 2 - 1)
    s1_matches = [False] * len(s1)
    s2_matches = [False] * len(s2)
    matches = 0

    for i, ch in enumerate(s1):
        start = max(0, i - match_distance)
        end = min(i + match_distance + 1, len(s2))
        for j in range(start, end):
            if s2_matches[j] or s1[i] != s2[j]:
                continue
            s1_matches[i] = True
            s2_matches[j] = True
            matches += 1
            break
    if matches == 0:
        return 0.0

    k = 0
    transpositions = 0
    for i, matched in enumerate(s1_matches):
        if not matched:
            continue
        while not s2_matches[k]:
            k += 1
        if s1[i] != s2[k]:
            transpositions += 1
        k += 1

    jaro = (
        matches / len(s1)
        + matches / len(s2)
        + (matches - transpositions / 2) / matches
    ) / 3

    prefix = 0
    for i in range(min(4, len(s1), len(s2))):
        if s1[i] == s2[i]:
            prefix += 1
        else:
            break
    return jaro + prefix * 0.1 * (1 - jaro)


def levenshtein(a_raw: str, b_raw: str) -> int:
    a, b = _normalize(a_raw), _normalize(b_raw)
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


def _family_tokens(family: str | None) -> list[str]:
    parts = re.split(r"[\s-]+", _normalize(family))
    return [p for p in parts if p]


def _name_score(query: dict, record: dict) -> float:
    q_given = query.get("given") or ""
    q_family = query.get("family") or ""
    r_given = record.get("given") or ""
    r_family = record.get("family") or ""
    given_jw = jaro_winkler(q_given, r_given) if q_given else 0.0
    family_jw = jaro_winkler(q_family, r_family) if q_family else 0.0
    q_tok = _family_tokens(q_family)
    r_tok = _family_tokens(r_family)
    if q_tok and r_tok:
        best = family_jw
        for q in q_tok:
            for r in r_tok:
                best = max(best, jaro_winkler(q, r))
        family_jw = best
    if not q_given and not q_family:
        return 0.0
    if not q_given:
        return family_jw
    if not q_family:
        return given_jw
    return given_jw * 0.45 + family_jw * 0.55


def _token_overlap(a: str | None, b: str | None) -> float:
    ta = set(_normalize(a).split())
    tb = set(_normalize(b).split())
    ta.discard("")
    tb.discard("")
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def band_for(score: float, nin_exact: bool, dob_exact: bool) -> MatchBand:
    if nin_exact and dob_exact:
        return "auto-link"
    if score >= 0.9:
        return "confirm"
    if score >= 0.6:
        return "workbench"
    return "no-match"


@dataclass
class MatchBreakdown:
    score: float
    band: MatchBand
    reasons: list[str]


def score_match(query: dict, record: dict) -> MatchBreakdown:
    name = _name_score(query, record)
    dob = 1.0 if query.get("birthDate") and query.get("birthDate") == record.get("birthDate") else 0.0
    sex = 1.0 if query.get("sex") and query.get("sex") == record.get("sex") else 0.0
    q_phone = _digits(query.get("phone"))[-10:]
    r_phone = _digits(record.get("phone"))[-10:]
    phone = 1.0 if q_phone and r_phone and q_phone == r_phone else 0.0
    address = _token_overlap(
        query.get("address"),
        " ".join(
            filter(
                None,
                [
                    record.get("addressLine"),
                    record.get("city"),
                    record.get("lga"),
                    record.get("state"),
                ],
            )
        ),
    )
    q_nin, r_nin = _digits(query.get("nin")), _digits(record.get("nin"))
    nin = 1.0 if q_nin and r_nin and q_nin == r_nin else 0.0

    score = name * 0.3 + dob * 0.25 + sex * 0.1 + phone * 0.2 + address * 0.05 + nin * 0.1
    reasons: list[str] = []
    if nin and dob:
        score = max(score, 0.99)
        reasons.append("NIN exact and date of birth consistent")
    if name >= 0.85 and dob and (phone or nin):
        score = max(score, 0.91)
        reasons.append("Strong name + DOB + identifier")
    if name >= 0.7:
        reasons.append(f"Name similarity {name:.2f}")
    if dob:
        reasons.append("Date of birth exact")
    if sex:
        reasons.append("Sex matches")
    if phone:
        reasons.append("Phone last-10 match")
    if address >= 0.2:
        reasons.append("Address tokens overlap")
    if nin:
        reasons.append("NIN exact")
    if not nin and not phone and name > 0 and score < 0.9:
        reasons.append("No shared identifier; will not auto-merge")

    score = min(0.995, round(score, 3))
    return MatchBreakdown(score=score, band=band_for(score, bool(nin), bool(dob)), reasons=reasons)
