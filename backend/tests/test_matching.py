from app.matching import score_match


def test_star_er_case_is_confirm_band():
    query = {
        "given": "Chidinma",
        "family": "Okafor-Adeyemi",
        "birthDate": "1994-03-12",
        "sex": "female",
        "phone": "08034412291",
        "address": "New Owerri",
    }
    record = {
        "given": "Chidinma",
        "family": "Okafor",
        "birthDate": "1994-03-12",
        "sex": "female",
        "phone": "08034412291",
        "nin": "23489105673",
        "addressLine": "14 University Road, Ihiagwa",
        "city": "Owerri",
        "lga": "Owerri West",
        "state": "Imo",
    }
    result = score_match(query, record)
    assert result.score >= 0.90
    assert result.band in {"confirm", "auto-link"}


def test_nin_and_dob_auto_link():
    query = {"given": "X", "family": "Y", "birthDate": "1990-01-01", "nin": "23489105673"}
    record = {
        "given": "Chidinma",
        "family": "Okafor",
        "birthDate": "1990-01-01",
        "nin": "23489105673",
        "sex": "female",
    }
    result = score_match(query, record)
    assert result.band == "auto-link"
    assert result.score >= 0.99


def test_twins_do_not_auto_link():
    a = {
        "given": "Ikenna",
        "family": "Eze",
        "birthDate": "1998-07-04",
        "sex": "male",
        "phone": "08055501901",
        "nin": "11223344556",
        "addressLine": "7 Works Layout",
        "city": "Owerri",
    }
    b = {
        "given": "Ikechukwu",
        "family": "Eze",
        "birthDate": "1998-07-04",
        "sex": "male",
        "phone": "08055501902",
        "nin": "11223344557",
        "addressLine": "7 Works Layout",
        "city": "Owerri",
    }
    result = score_match(a, b)
    assert result.band != "auto-link"
    assert result.score < 0.90


def test_same_name_different_dob_is_weak():
    query = {"given": "Adaobi", "family": "Nwosu", "birthDate": "1991-02-02", "sex": "female"}
    record = {
        "given": "Adaobi",
        "family": "Nwosu",
        "birthDate": "1976-09-18",
        "sex": "female",
        "phone": "08098881212",
    }
    result = score_match(query, record)
    assert result.band in {"workbench", "no-match"}
    assert result.score < 0.90
