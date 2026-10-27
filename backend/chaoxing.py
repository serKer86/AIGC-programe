"""Chaoxing login, credential storage, homework fetching and parsing."""

import json
import logging
import os
import re
from base64 import b64encode
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from cryptography.fernet import Fernet, InvalidToken

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
KEY_FILE = DATA_DIR / "secret.key"
COOKIE_FILE = DATA_DIR / "cookies.enc"
LAST_HOMEWORK_FILE = DATA_DIR / "last_homework.json"

logger = logging.getLogger("chaoxing")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)
logger.propagate = False

CHAOXING_LOGIN_URL = os.environ.get(
    "CHAOXING_LOGIN_URL",
    "https://passport2.chaoxing.com/fanyalogin",
)
CHAOXING_REFERER = "https://passport2.chaoxing.com/"
CHAOXING_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
AES_KEY = b"u2oh6Vu^HWe4_AES"
REQUIRED_COOKIES = ("_uid", "uid", "fid", "_d")
CAPTCHA_KEYWORDS = (
    "验证码",
    "captcha",
    "异常",
    "频繁",
    "风险",
    "安全验证",
    "滑动验证",
    "尝试次数",
)
# Keep backend timeouts below the frontend's 15s request budget so the UI
# receives a readable error instead of aborting the request itself.
HOMEWORK_TIMEOUT = 12
LOGIN_TIMEOUT = 12
CHINA_TZ = timezone(timedelta(hours=8))
COURSE_LIST_URL = os.environ.get(
    "CHAOXING_COURSE_LIST_URL",
    "https://mooc1.chaoxing.com/visit/courselistdata?courseType=1",
)
ALL_COURSES_SOURCE = "all://courses"
COURSE_FETCH_WORKERS = 4
STATUS_UNSUBMITTED = "未交"
STATUS_SUBMITTED = "已交"
STATUS_PENDING = "待批阅"
STATUS_WORDS = (
    "未交",
    "未提交",
    "待交",
    "未完成",
    "已交",
    "已提交",
    "已完成",
    "已批阅",
    "待批阅",
    "待评阅",
    "批阅中",
)
DEADLINE_RE = re.compile(
    r"(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?"
    r"(?:\s*(\d{1,2})\s*[:：时]\s*(\d{1,2})?)?"
)
REMAINING_RE = re.compile(
    r"剩余\s*(?:(\d+)\s*天)?\s*(?:(\d+)\s*小时)?\s*(?:(\d+)\s*分钟)?"
)
WORK_ITEM_SELECTORS = (
    "ul.workList li",
    "ul.work-list li",
    "ul.work_list li",
    ".workList li",
    ".work-list li",
    ".workItem",
    ".work-item",
    ".workListItem",
    "[class*='workList'] li",
    ".bottomList li",
)
TITLE_SELECTORS = (
    ".workTitle",
    ".work-title",
    ".workTitle a",
    ".work-title a",
    ".work_item_title",
    ".work-item__title",
    ".overHidden2",
    ".right-content p",
    ".tit",
    ".title",
    "h3",
    "h4",
    "td a",
    "a[href*='work']",
    "a[href*='homework']",
    "a",
)
COURSE_SELECTORS = (
    ".courseName",
    ".course-name",
    ".courseTitle",
    ".course-title",
    ".course_name",
    ".mark_title",
)


class SessionExpired(Exception):
    pass


class FetchNetworkError(Exception):
    pass


def encrypt_password(password: str) -> str:
    cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_KEY)
    padded = pad(password.encode("utf-8"), AES.block_size)
    return b64encode(cipher.encrypt(padded)).decode("ascii")


def load_fernet() -> Fernet:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not KEY_FILE.exists():
        KEY_FILE.write_bytes(Fernet.generate_key())
        try:
            KEY_FILE.chmod(0o600)
        except OSError:
            pass
    return Fernet(KEY_FILE.read_bytes().strip())


def save_cookies(cookies) -> None:
    payload = {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "cookies": [
            {
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
            }
            for cookie in cookies
        ],
    }
    token = load_fernet().encrypt(
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
    )
    temp_file = COOKIE_FILE.with_suffix(".tmp")
    temp_file.write_bytes(token)
    try:
        temp_file.chmod(0o600)
    except OSError:
        pass
    temp_file.replace(COOKIE_FILE)


def has_valid_credentials() -> bool:
    if not COOKIE_FILE.exists() or not KEY_FILE.exists():
        return False
    try:
        decrypted = load_fernet().decrypt(COOKIE_FILE.read_bytes())
        payload = json.loads(decrypted)
    except (InvalidToken, ValueError, OSError, TypeError):
        return False
    return isinstance(payload, dict) and bool(payload.get("cookies"))


def load_cookies() -> list[dict[str, str]]:
    if not COOKIE_FILE.exists() or not KEY_FILE.exists():
        raise SessionExpired

    try:
        payload = json.loads(load_fernet().decrypt(COOKIE_FILE.read_bytes()))
    except (InvalidToken, ValueError, OSError, TypeError):
        raise SessionExpired from None

    cookies = payload.get("cookies") if isinstance(payload, dict) else None
    if not isinstance(cookies, list):
        raise SessionExpired

    cleaned: list[dict[str, str]] = []
    for cookie in cookies:
        if not isinstance(cookie, dict):
            continue
        name = cookie.get("name")
        value = cookie.get("value")
        if isinstance(name, str) and name and isinstance(value, str):
            cleaned.append(
                {
                    "name": name,
                    "value": value,
                    "domain": str(cookie.get("domain") or ""),
                    "path": str(cookie.get("path") or "/"),
                }
            )
    if not cleaned:
        raise SessionExpired
    return cleaned


def clear_last_homework() -> None:
    try:
        LAST_HOMEWORK_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def normalize_work_url(raw: str) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = f"https://{value}"
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    if parsed.username or parsed.password:
        return None
    return value


def is_allowed_host(hostname: str) -> bool:
    host = hostname.lower().rstrip(".")
    if not host:
        return False
    if host == "chaoxing.com" or host.endswith(".chaoxing.com"):
        return True
    if host in ("127.0.0.1", "localhost", "::1"):
        return True

    extra_hosts = os.environ.get("HOMEWORK_FETCH_ALLOWED_HOSTS", "")
    for candidate in extra_hosts.split(","):
        candidate = candidate.strip().lower().rstrip(".")
        if not candidate:
            continue
        if host == candidate or host.endswith(f".{candidate}"):
            return True
    return False


def is_login_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower()
    return "passport" in host or "login" in path or "passport" in path


def fetch_work_page(url: str, cookies: list[dict[str, str]]) -> requests.Response:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": CHAOXING_USER_AGENT,
            "Referer": url,
            "Accept-Language": "zh-CN,zh;q=0.9",
        }
    )
    for cookie in cookies:
        cookie_options = {"path": cookie["path"] or "/"}
        if cookie["domain"]:
            cookie_options["domain"] = cookie["domain"]
        session.cookies.set(cookie["name"], cookie["value"], **cookie_options)

    current = url
    for _ in range(6):
        try:
            response = session.get(
                current, timeout=HOMEWORK_TIMEOUT, allow_redirects=False
            )
        except requests.RequestException:
            raise FetchNetworkError("无法连接学习通") from None

        if response.status_code in (401, 403):
            raise SessionExpired
        if not response.is_redirect:
            final_host = urlparse(response.url).hostname or ""
            if not is_allowed_host(final_host):
                raise FetchNetworkError("作业页地址不允许访问")
            return response

        location = response.headers.get("Location")
        if not location:
            return response
        next_url = urljoin(current, location)
        if is_login_url(next_url):
            raise SessionExpired
        parsed = urlparse(next_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise FetchNetworkError("作业页跳转地址无效")
        if not is_allowed_host(parsed.hostname):
            raise FetchNetworkError("作业页跳转到了不允许的地址")
        current = next_url

    raise FetchNetworkError("作业页重定向次数过多")


def response_html(response: requests.Response) -> str:
    encoding = (response.encoding or "").lower()
    if encoding == "iso-8859-1":
        return response.content.decode("utf-8", errors="replace")
    return response.text


def looks_like_login_page(soup: BeautifulSoup) -> bool:
    if soup.select_one('input[name="uname"]') and soup.select_one(
        'input[type="password"]'
    ):
        return True
    if soup.select_one('form[action*="fanyalogin"]'):
        return True
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    return bool(title) and "登录" in title and len(title) <= 20


def parse_deadline(text: str) -> str:
    for match in DEADLINE_RE.finditer(text):
        year, month, day = (int(match.group(index)) for index in (1, 2, 3))
        hour = int(match.group(4)) if match.group(4) else 23
        minute = int(match.group(5)) if match.group(5) else 59
        try:
            deadline = datetime(
                year, month, day, hour, minute, tzinfo=CHINA_TZ
            )
        except ValueError:
            continue
        return deadline.isoformat()
    return ""


def parse_remaining_deadline(text: str) -> str:
    match = REMAINING_RE.search(text)
    if not match or not any(match.groups()):
        return ""
    days, hours, minutes = (int(group) if group else 0 for group in match.groups())
    now = datetime.now(CHINA_TZ).replace(second=0, microsecond=0)
    return (now + timedelta(days=days, hours=hours, minutes=minutes)).isoformat()


def parse_status(text: str) -> str:
    if any(word in text for word in ("待批阅", "待评阅", "批阅中")):
        return STATUS_PENDING
    if any(word in text for word in ("已交", "已提交", "已完成", "已批阅")):
        return STATUS_SUBMITTED
    if any(word in text for word in ("未交", "未提交", "待交", "未完成")):
        return STATUS_UNSUBMITTED
    return STATUS_UNSUBMITTED


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def extract_course_name(soup: BeautifulSoup) -> str:
    for selector in COURSE_SELECTORS:
        element = soup.select_one(selector)
        if not element:
            continue
        candidate = clean_text(element.get_text(" ", strip=True))
        if 0 < len(candidate) <= 80:
            return candidate

    if soup.title:
        for part in re.split(r"\s*[-|_]\s*", soup.title.get_text(" ", strip=True)):
            part = part.strip()
            if not part or len(part) > 40:
                continue
            if any(word in part for word in ("作业", "学习通", "超星", "首页")):
                continue
            return part
    return ""


def extract_title(node) -> str:
    for selector in TITLE_SELECTORS:
        element = node.select_one(selector)
        if not element:
            continue
        candidate = clean_text(element.get_text(" ", strip=True))
        if (
            len(candidate) >= 2
            and not DEADLINE_RE.search(candidate)
            and candidate not in STATUS_WORDS
        ):
            return candidate[:200]

    for line in node.get_text("\n", strip=True).splitlines():
        line = clean_text(line)
        if len(line) < 2 or line in STATUS_WORDS:
            continue
        if DEADLINE_RE.search(line) or line.startswith(("截止", "状态", "发布")):
            continue
        return line[:200]
    return ""


def find_candidate_nodes(soup: BeautifulSoup) -> list:
    for selector in WORK_ITEM_SELECTORS:
        nodes = soup.select(selector)
        if nodes:
            return nodes

    nodes = []
    for node in soup.find_all(["li", "tr"]):
        text = node.get_text(" ", strip=True)
        if DEADLINE_RE.search(text) or any(word in text for word in STATUS_WORDS):
            nodes.append(node)
    return nodes


def input_value(soup: BeautifulSoup, *selectors: str) -> str:
    for selector in selectors:
        element = soup.select_one(selector)
        if element and element.get("value"):
            return clean_text(str(element.get("value")))
    return ""


def build_work_list_url(soup: BeautifulSoup, page_url: str) -> str | None:
    parsed_page = urlparse(page_url)
    if "/work/list" in (parsed_page.path or "").lower():
        return None

    work_enc = input_value(soup, "#workEnc", "input[name='workEnc']")
    if not work_enc:
        return None

    query = parse_qs(parsed_page.query)

    def first_value(names: tuple[str, ...], selectors: tuple[str, ...]) -> str:
        value = input_value(soup, *selectors)
        if value:
            return value
        for name in names:
            values = query.get(name)
            if values:
                return values[0]
        return ""

    course_id = first_value(
        ("courseid", "courseId"), ("#courseId", "input[name='courseId']")
    )
    class_id = first_value(
        ("clazzid", "classId"), ("#classId", "input[name='classId']")
    )
    cpi = first_value(("cpi",), ("#cpi", "input[name='cpi']"))
    if not course_id or not class_id:
        return None

    base = "https://mooc1.chaoxing.com/mooc-ans/mooc2/work/list"
    anchor = soup.select_one("a[data-url*='/mooc2/work/list']")
    if anchor:
        candidate = urljoin(page_url, str(anchor.get("data-url") or ""))
        candidate_url = urlparse(candidate)
        if is_allowed_host(candidate_url.hostname or ""):
            base = f"{candidate_url.scheme}://{candidate_url.netloc}{candidate_url.path}"

    params = {"courseId": course_id, "classId": class_id, "enc": work_enc}
    if cpi:
        params["cpi"] = cpi
    return f"{base}?{urlencode(params)}"


def parse_homework_items(
    soup: BeautifulSoup, default_course_name: str = ""
) -> list[dict[str, str]]:
    course_name = default_course_name or extract_course_name(soup)
    items: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for node in find_candidate_nodes(soup):
        text = node.get_text(" ", strip=True)
        title = extract_title(node)
        if not title:
            continue
        deadline = parse_deadline(text) or parse_remaining_deadline(text)
        key = (title, deadline)
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "courseName": course_name,
                "title": title,
                "deadline": deadline,
                "status": parse_status(text),
            }
        )
    return items


def parse_course_urls(soup: BeautifulSoup, base_url: str) -> list[str]:
    urls: list[str] = []
    seen: set[tuple[str, str]] = set()

    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "").strip()
        if "stucoursemiddle" not in href:
            continue
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            continue
        if not is_allowed_host(parsed.hostname or ""):
            continue

        query = parse_qs(parsed.query)
        course_id = (query.get("courseid") or query.get("courseId") or [""])[0]
        class_id = (query.get("clazzid") or query.get("classId") or [""])[0]
        key = (course_id, class_id)
        if not course_id or not class_id:
            key = (absolute, "")
        if key in seen:
            continue
        seen.add(key)
        urls.append(absolute)
    return urls


def course_display_name(course_url: str, course_name: str = "") -> str:
    if course_name:
        return course_name
    query = parse_qs(urlparse(course_url).query)
    course_id = (query.get("courseid") or query.get("courseId") or [""])[0]
    return f"课程 {course_id}" if course_id else "未知课程"


def fetch_course_homework(
    course_url: str, cookies: list[dict[str, str]]
) -> tuple[str, list[dict[str, str]]]:
    response = fetch_work_page(course_url, cookies)
    final = urlparse(response.url or course_url)
    logger.info(
        "course page host=%s path=%s status=%s",
        final.hostname,
        final.path,
        response.status_code,
    )
    if response.status_code >= 400:
        location = f"{final.hostname or ''}{final.path or ''}"
        raise FetchNetworkError(
            f"课程页返回 HTTP {response.status_code}（{location}）"
        )

    soup = BeautifulSoup(response_html(response), "html.parser")
    if looks_like_login_page(soup):
        raise SessionExpired

    course_name = extract_course_name(soup)
    work_url = build_work_list_url(soup, response.url or course_url)
    if not work_url:
        return course_name, []

    work_response = fetch_work_page(work_url, cookies)
    work_final = urlparse(work_response.url or work_url)
    logger.info(
        "course work list host=%s path=%s status=%s",
        work_final.hostname,
        work_final.path,
        work_response.status_code,
    )
    if work_response.status_code >= 400:
        location = f"{work_final.hostname or ''}{work_final.path or ''}"
        raise FetchNetworkError(
            f"作业列表返回 HTTP {work_response.status_code}（{location}）"
        )

    work_soup = BeautifulSoup(response_html(work_response), "html.parser")
    if looks_like_login_page(work_soup):
        raise SessionExpired

    return course_name, parse_homework_items(work_soup, course_name)


def save_last_homework(
    source_url: str,
    items: list[dict[str, str]],
    fetched_at: str,
    extra: dict | None = None,
) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetchedAt": fetched_at,
        "sourceUrl": source_url,
        "items": items,
    }
    if extra:
        payload.update(extra)
    temp_file = LAST_HOMEWORK_FILE.with_suffix(".tmp")
    temp_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    try:
        temp_file.chmod(0o600)
    except OSError:
        pass
    temp_file.replace(LAST_HOMEWORK_FILE)


def is_captcha_text(text: str) -> bool:
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in CAPTCHA_KEYWORDS)


def sanitize_message(text: str) -> str:
    """Strip markup, collapse whitespace, mask phone numbers, cap the length."""
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"\b1\d{10}\b", "***", cleaned)
    return cleaned[:120]


def missing_required_cookies(cookies) -> list[str]:
    present = {cookie.name.lower() for cookie in cookies}
    return [name for name in REQUIRED_COOKIES if name.lower() not in present]


DIAGNOSTIC_FIELDS = (
    "result",
    "msg",
    "message",
    "errorMsg",
    "errorCode",
    "code",
    "status",
    "reason",
)


def describe_login_response(response: requests.Response) -> str:
    """Summarize the response shape without logging tokens or credentials."""
    try:
        data = response.json()
    except ValueError:
        content_type = response.headers.get("Content-Type", "unknown")
        return f"non-json content-type={content_type}"
    if not isinstance(data, dict):
        return f"json type={type(data).__name__}"
    fields = {
        name: sanitize_message(str(data[name]))[:60]
        for name in DIAGNOSTIC_FIELDS
        if name in data
    }
    return f"keys={sorted(data.keys())} fields={fields}"


def interpret_login(response: requests.Response) -> tuple[str, str]:
    if response.status_code == 403:
        return "NEED_CAPTCHA", "学习通要求完成安全验证"
    if response.status_code >= 500:
        return "NETWORK_ERROR", "学习通服务暂时不可用"

    try:
        data = response.json()
    except ValueError:
        data = None

    if isinstance(data, dict):
        result = data.get("result")
        status = data.get("status")
        if (
            result is True
            or result == "true"
            or status is True
            or status == "true"
            or status == 1
        ):
            return "OK", str(data.get("msg") or "登录成功")
        message = str(data.get("msg") or data.get("message") or "登录失败")
        message = sanitize_message(message) or "登录失败"
        if is_captcha_text(message):
            return "NEED_CAPTCHA", message
        return "INVALID_CREDENTIALS", message

    text = response.text or ""
    if is_captcha_text(text) or "captcha" in response.url.lower():
        return "NEED_CAPTCHA", "学习通要求完成验证码校验"
    return "NETWORK_ERROR", "学习通返回了无法识别的响应"


def bind_account(phone: str, password: str) -> dict:
    phone = (phone or "").strip()
    if not phone or not password:
        return {
            "ok": False,
            "code": "INVALID_CREDENTIALS",
            "message": "手机号或密码不能为空",
        }

    payload = {
        "fid": "-1",
        "uname": phone,
        "password": encrypt_password(password),
        "refer": CHAOXING_REFERER,
        "t": "true",
        "forbidotherlogin": "0",
        "validate": "",
    }

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": CHAOXING_USER_AGENT,
            "Referer": CHAOXING_REFERER,
            "Origin": "https://passport2.chaoxing.com",
        }
    )

    try:
        response = session.post(
            CHAOXING_LOGIN_URL, data=payload, timeout=LOGIN_TIMEOUT
        )
    except requests.RequestException:
        return {
            "ok": False,
            "code": "NETWORK_ERROR",
            "message": "无法连接学习通",
        }

    outcome, message = interpret_login(response)
    logger.info(
        "chaoxing login status=%s outcome=%s message=%s",
        response.status_code,
        outcome,
        sanitize_message(message),
    )
    logger.info(
        "chaoxing login response %s cookies=%s",
        describe_login_response(response),
        sorted(cookie.name for cookie in session.cookies),
    )
    if outcome == "NEED_CAPTCHA":
        return {"ok": False, "code": "NEED_CAPTCHA", "message": message}
    if outcome == "INVALID_CREDENTIALS":
        return {"ok": False, "code": "INVALID_CREDENTIALS", "message": message}
    if outcome == "NETWORK_ERROR":
        return {"ok": False, "code": "NETWORK_ERROR", "message": message}

    cookies = list(session.cookies)
    missing = missing_required_cookies(cookies)
    if missing:
        logger.warning(
            "chaoxing login missing cookies: %s", ", ".join(missing)
        )
        return {
            "ok": False,
            "code": "NETWORK_ERROR",
            "message": "登录成功但未获取到完整凭证",
        }

    try:
        save_cookies(cookies)
    except OSError:
        return {
            "ok": False,
            "code": "NETWORK_ERROR",
            "message": "无法保存本地凭证",
        }

    clear_last_homework()
    return {"ok": True}


def unbind_account() -> dict[str, bool]:
    try:
        COOKIE_FILE.unlink(missing_ok=True)
    except OSError:
        return {"ok": False}
    clear_last_homework()
    return {"ok": True}


def fetch_homework(work_list_url: str) -> dict:
    try:
        cookies = load_cookies()
    except SessionExpired:
        return {"ok": False, "code": "SESSION_EXPIRED"}

    url = normalize_work_url(work_list_url)
    if not url or not is_allowed_host(urlparse(url).hostname or ""):
        return {
            "ok": False,
            "code": "INVALID_URL",
            "message": "请粘贴学习通作业列表页的完整 URL",
        }

    try:
        response = fetch_work_page(url, cookies)
    except SessionExpired:
        return {"ok": False, "code": "SESSION_EXPIRED"}
    except FetchNetworkError as error:
        return {"ok": False, "code": "NETWORK_ERROR", "message": str(error)}

    final_url = urlparse(response.url or url)
    logger.info(
        "homework fetch host=%s path=%s status=%s",
        final_url.hostname,
        final_url.path,
        response.status_code,
    )

    if response.status_code >= 400:
        location = f"{final_url.hostname or ''}{final_url.path or ''}"
        return {
            "ok": False,
            "code": "NETWORK_ERROR",
            "message": f"学习通返回 HTTP {response.status_code}（{location}）",
        }

    source_url = response.url or url
    soup = BeautifulSoup(response_html(response), "html.parser")
    if looks_like_login_page(soup):
        return {"ok": False, "code": "SESSION_EXPIRED"}

    course_name = ""
    work_soup = soup
    work_url = build_work_list_url(soup, source_url)
    if work_url:
        course_name = extract_course_name(soup)
        try:
            work_response = fetch_work_page(work_url, cookies)
        except SessionExpired:
            return {"ok": False, "code": "SESSION_EXPIRED"}
        except FetchNetworkError as error:
            return {"ok": False, "code": "NETWORK_ERROR", "message": str(error)}

        work_final = urlparse(work_response.url or work_url)
        logger.info(
            "homework list host=%s path=%s status=%s",
            work_final.hostname,
            work_final.path,
            work_response.status_code,
        )
        if work_response.status_code >= 400:
            location = f"{work_final.hostname or ''}{work_final.path or ''}"
            return {
                "ok": False,
                "code": "NETWORK_ERROR",
                "message": (
                    f"学习通返回 HTTP {work_response.status_code}（{location}）"
                ),
            }

        work_soup = BeautifulSoup(response_html(work_response), "html.parser")
        if looks_like_login_page(work_soup):
            return {"ok": False, "code": "SESSION_EXPIRED"}

    items = parse_homework_items(work_soup, course_name)
    if not items:
        return {
            "ok": False,
            "code": "PARSE_EMPTY",
            "message": "未解析到作业，页面结构可能已变化",
        }

    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        save_last_homework(source_url, items, fetched_at)
    except OSError:
        pass

    return {
        "ok": True,
        "items": items,
        "fetchedAt": fetched_at,
        "sourceUrl": source_url,
    }


def fetch_all_homework() -> dict:
    try:
        cookies = load_cookies()
    except SessionExpired:
        return {"ok": False, "code": "SESSION_EXPIRED"}

    try:
        response = fetch_work_page(COURSE_LIST_URL, cookies)
    except SessionExpired:
        return {"ok": False, "code": "SESSION_EXPIRED"}
    except FetchNetworkError as error:
        return {"ok": False, "code": "NETWORK_ERROR", "message": str(error)}

    final = urlparse(response.url or COURSE_LIST_URL)
    logger.info(
        "course list host=%s path=%s status=%s",
        final.hostname,
        final.path,
        response.status_code,
    )
    if response.status_code >= 400:
        location = f"{final.hostname or ''}{final.path or ''}"
        return {
            "ok": False,
            "code": "NETWORK_ERROR",
            "message": f"学习通返回 HTTP {response.status_code}（{location}）",
        }

    soup = BeautifulSoup(response_html(response), "html.parser")
    if looks_like_login_page(soup):
        return {"ok": False, "code": "SESSION_EXPIRED"}

    course_urls = parse_course_urls(soup, response.url or COURSE_LIST_URL)
    if not course_urls:
        return {
            "ok": False,
            "code": "PARSE_EMPTY",
            "message": "未找到课程，请确认学习通账号中已有课程",
        }

    results: list[tuple[str, list[dict[str, str]]] | None] = [None] * len(
        course_urls
    )
    failed_courses: list[dict[str, str]] = []
    session_expired = 0

    with ThreadPoolExecutor(max_workers=COURSE_FETCH_WORKERS) as executor:
        futures = {
            executor.submit(fetch_course_homework, url, cookies): (index, url)
            for index, url in enumerate(course_urls)
        }
        for future in as_completed(futures):
            index, url = futures[future]
            try:
                results[index] = future.result()
            except SessionExpired:
                session_expired += 1
                failed_courses.append(
                    {
                        "courseName": course_display_name(url),
                        "message": "登录已过期",
                    }
                )
            except FetchNetworkError as error:
                failed_courses.append(
                    {
                        "courseName": course_display_name(url),
                        "message": str(error),
                    }
                )
            except Exception:
                logger.exception("course fetch crashed")
                failed_courses.append(
                    {
                        "courseName": course_display_name(url),
                        "message": "课程页面解析失败",
                    }
                )

    success_count = sum(1 for result in results if result is not None)
    if success_count == 0:
        if session_expired:
            return {"ok": False, "code": "SESSION_EXPIRED"}
        first_message = (
            failed_courses[0]["message"] if failed_courses else "课程拉取失败"
        )
        return {
            "ok": False,
            "code": "NETWORK_ERROR",
            "message": f"全部课程拉取失败：{first_message}",
        }

    items: list[dict[str, str]] = []
    seen: set[tuple[str, str, str, str]] = set()
    for result in results:
        if not result:
            continue
        for item in result[1]:
            key = (
                item["courseName"],
                item["title"],
                item["deadline"],
                item["status"],
            )
            if key in seen:
                continue
            seen.add(key)
            items.append(item)

    fetched_at = datetime.now(timezone.utc).isoformat()
    logger.info(
        "homework fetch-all courses=%s items=%s failed=%s",
        len(course_urls),
        len(items),
        len(failed_courses),
    )
    try:
        save_last_homework(
            ALL_COURSES_SOURCE,
            items,
            fetched_at,
            {
                "courseCount": len(course_urls),
                "failedCourses": failed_courses,
            },
        )
    except OSError:
        pass

    return {
        "ok": True,
        "items": items,
        "fetchedAt": fetched_at,
        "sourceUrl": ALL_COURSES_SOURCE,
        "courseCount": len(course_urls),
        "failedCourses": failed_courses,
    }


def get_last_homework() -> dict:
    empty = {
        "ok": True,
        "items": [],
        "fetchedAt": None,
        "sourceUrl": None,
        "courseCount": None,
        "failedCourses": [],
    }
    if not LAST_HOMEWORK_FILE.exists():
        return empty

    try:
        payload = json.loads(LAST_HOMEWORK_FILE.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return empty
    if not isinstance(payload, dict):
        return empty

    items = payload.get("items")
    course_count = payload.get("courseCount")
    failed_courses = payload.get("failedCourses")
    return {
        "ok": True,
        "items": items if isinstance(items, list) else [],
        "fetchedAt": payload.get("fetchedAt"),
        "sourceUrl": payload.get("sourceUrl"),
        "courseCount": course_count if isinstance(course_count, int) else None,
        "failedCourses": (
            failed_courses if isinstance(failed_courses, list) else []
        ),
    }
