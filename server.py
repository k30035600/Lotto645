# -*- coding: utf-8 -*-
"""
HTTP 서버 모듈 (Python/Flask)
- 정적 파일 서빙
- DuckDuckGo 검색으로 로또645 최신 당첨번호 취득
"""
import sys
# Windows 콘솔 출력 인코딩 설정 (한글 깨짐 방지)
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    pass  # Python < 3.7 또는 파이프/리다이렉트 환경

import os
import re
import urllib.request
import ssl
from pathlib import Path

from flask import Flask, send_from_directory, request, jsonify

try:
    from flask_cors import CORS
except ImportError:
    CORS = None

try:
    from ddgs import DDGS
    HAS_DDGS = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        HAS_DDGS = True
    except ImportError:
        HAS_DDGS = False

# --- 설정 ---
PORT = int(os.environ.get('PORT', 8000))
BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')
app.config['JSON_AS_ASCII'] = False  # JSON 한글 깨짐 방지 (\\uXXXX 이스케이프 방지)
if CORS is not None:
    CORS(app)  # Live Server(5500) -> Flask(8000) 등 cross-origin 요청 허용


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }


def json_cors_headers():
    return {**cors_headers(), 'Content-Type': 'application/json; charset=utf-8'}


# --- 당첨번호 취득 (mock 없음, 실패 시 상태 반환) ---

def _parse_lotto_from_text(text):
    """
    텍스트에서 로또 당첨번호 파싱.
    회차, 6개 본번호(1-45), 1개 보너스(1-45) 추출.
    """
    if not text or len(text) < 10:
        return None
    text = re.sub(r'\s+', ' ', text)
    # 회차: N회 (1000~1999 범위 주로)
    round_m = re.search(r'(\d{3,5})\s*회', text)
    drw_no = int(round_m.group(1)) if round_m else None
    # 숫자 추출: 1~45 범위의 1~2자리 숫자
    nums = re.findall(r'\b([1-9]|[1-3]\d|4[0-5])\b', text)
    nums = [int(n) for n in nums]
    # 중복 제거, 순서 유지 (첫 6개 = 본번호, 7번째 = 보너스)
    seen = set()
    unique = []
    for n in nums:
        if n not in seen and 1 <= n <= 45:
            seen.add(n)
            unique.append(n)
    if len(unique) >= 7:
        main = sorted(unique[:6])
        bonus = unique[6]
        if bonus in main:
            # 보너스가 본번호와 겹치면 다음 숫자 사용
            for x in unique[7:]:
                if x != bonus and 1 <= x <= 45:
                    bonus = x
                    break
        if len(main) == 6 and 1 <= bonus <= 45 and bonus not in main:
            return {
                'drwNo': drw_no,
                'drwtNo1': main[0], 'drwtNo2': main[1], 'drwtNo3': main[2],
                'drwtNo4': main[3], 'drwtNo5': main[4], 'drwtNo6': main[5],
                'bnusNo': bonus
            }
    # 대안: "3, 11, 22, 35, 40, 44" + "7" 패턴
    main_m = re.search(r'(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})', text)
    if main_m:
        main = sorted([int(main_m.group(i)) for i in range(1, 7)])
        if all(1 <= n <= 45 for n in main) and len(set(main)) == 6:
            bonus_m = re.search(r'보너스\s*[:]?\s*(\d{1,2})|\+\s*(\d{1,2})|,\s*(\d{1,2})\s*[\)\]]', text)
            bonus = None
            if bonus_m:
                for g in bonus_m.groups():
                    if g:
                        b = int(g)
                        if 1 <= b <= 45 and b not in main:
                            bonus = b
                            break
            if bonus:
                return {
                    'drwNo': drw_no,
                    'drwtNo1': main[0], 'drwtNo2': main[1], 'drwtNo3': main[2],
                    'drwtNo4': main[3], 'drwtNo5': main[4], 'drwtNo6': main[5],
                    'bnusNo': bonus
                }
    return None


def _fetch_dhlottery_result_page():
    """동행복권 결과 페이지 HTML 가져오기 (API 아님, 공개 페이지)."""
    url = 'https://www.dhlottery.co.kr/lt645/result'
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    with urllib.request.urlopen(req, timeout=15, context=ctx) as f:
        return f.read().decode(f.headers.get_content_charset() or 'utf-8')


def _parse_lotto_from_html(html):
    """동행복권 결과 페이지 HTML에서 당첨번호 파싱."""
    # drwtNo1~6, bnusNo 클래스 또는 data 속성
    nums = re.findall(r'drwtNo[1-6]|bnusNo', html)
    vals = re.findall(r'["\']?(?:drwtNo[1-6]|bnusNo)["\']?\s*[:=]\s*["\']?(\d{1,2})["\']?', html, re.I)
    if not vals:
        vals = re.findall(r'<span[^>]*class="[^"]*ball[^"]*"[^>]*>(\d{1,2})</span>', html, re.I)
    if len(vals) >= 7:
        main = sorted([int(v) for v in vals[:6] if v.isdigit() and 1 <= int(v) <= 45])
        bonus = int(vals[6]) if vals[6].isdigit() and 1 <= int(vals[6]) <= 45 else None
        if len(main) == 6 and bonus and bonus not in main:
            drw = re.search(r'drwNo["\']?\s*[:=]\s*["\']?(\d+)["\']?', html, re.I)
            drw_no = int(drw.group(1)) if drw else None
            return {'drwNo': drw_no, 'main': main, 'bnusNo': bonus}
    return None


def _to_result(parsed, source):
    """파싱 결과를 API 응답 형식으로 변환."""
    import datetime
    return {
        'returnValue': 'success',
        'drwNo': parsed.get('drwNo'),
        'drwNoDate': datetime.date.today().isoformat(),
        'drwtNo1': parsed['main'][0], 'drwtNo2': parsed['main'][1],
        'drwtNo3': parsed['main'][2], 'drwtNo4': parsed['main'][3],
        'drwtNo5': parsed['main'][4], 'drwtNo6': parsed['main'][5],
        'bnusNo': parsed['bnusNo'],
        'firstWinamnt': 0,
        'source': source
    }


def fetch_latest_lotto_from_result_page():
    """
    최신 당첨번호 취득. mock 없음.
    반환: (결과 dict 또는 None, 에러 str 또는 None, 상태 dict)
    """
    status = {'dhlottery_page': '', 'duckduckgo': ''}
    # 1) 동행복권 결과 페이지
    try:
        html = _fetch_dhlottery_result_page()
        parsed = _parse_lotto_from_html(html)
        if parsed:
            status['dhlottery_page'] = '성공'
            return _to_result(parsed, 'dhlottery_page'), None, status
        status['dhlottery_page'] = '실패 (HTML에서 당첨번호 패턴을 찾지 못함)'
    except Exception as e:
        status['dhlottery_page'] = '실패 (%s: %s)' % (type(e).__name__, str(e)[:80])
        print('[Lotto] 동행복권:', e)
    # 2) DuckDuckGo 검색
    if HAS_DDGS:
        combined = []
        try:
            with DDGS() as ddgs:
                for q in ['로또645 최신 당첨번호', '동행복권 당첨결과', '로또 645 당첨번호']:
                    results = list(ddgs.text(q, region='kr-kr', max_results=5))
                    combined = [(r.get('title') or '') + ' ' + (r.get('body') or r.get('snippet') or '') for r in results]
                    if combined:
                        break
        except Exception as e:
            status['duckduckgo'] = '실패 (검색 예외: %s)' % str(e)[:60]
            print('[Lotto] DuckDuckGo:', e)
        if not status.get('duckduckgo'):
            for block in combined:
                parsed = _parse_lotto_from_text(block)
                if parsed:
                    status['duckduckgo'] = '성공'
                    main = parsed.get('main') or [parsed.get('drwtNo%d' % i) for i in range(1, 7)]
                    return {
                        'returnValue': 'success',
                        'drwNo': parsed.get('drwNo'),
                        'drwNoDate': __import__('datetime').date.today().isoformat(),
                        'drwtNo1': main[0], 'drwtNo2': main[1], 'drwtNo3': main[2],
                        'drwtNo4': main[3], 'drwtNo5': main[4], 'drwtNo6': main[5],
                        'bnusNo': parsed['bnusNo'],
                        'firstWinamnt': 0,
                        'source': 'duckduckgo'
                    }, None, status
            status['duckduckgo'] = '실패 (검색 결과에서 당첨번호 패턴을 찾지 못함)'
    else:
        status['duckduckgo'] = '실패 (ddgs 미설치)'
    return None, '당첨번호를 가져오지 못했습니다.', status


# --- 라우트 (API를 catch-all보다 먼저 등록) ---
@app.route('/favicon.ico')
def favicon():
    return '', 204, {'Content-Type': 'image/x-icon'}


@app.route('/api', methods=['GET'])
@app.route('/api/', methods=['GET'])
def api_index():
    """서버 확인용: 이 응답이 보이면 Flask 서버가 맞음."""
    return jsonify(
        server='lotto-flask',
        endpoints=['/api/lotto-latest'],
        source='duckduckgo'
    ), 200, json_cors_headers()


def _handle_lotto_latest():
    """최신 추첨 API 공통 처리 (라우트/catch-all 둘 다 사용)."""
    if request.method == 'OPTIONS':
        return '', 204, {**cors_headers(), 'Content-Length': '0'}
    if not HAS_DDGS:
        return jsonify(returnValue='fail', error='ddgs 패키지가 필요합니다. pip install ddgs'), 500, json_cors_headers()
    data, err, status = fetch_latest_lotto_from_result_page()
    if err:
        return jsonify(
            returnValue='fail',
            error=err,
            dhlottery_page=status.get('dhlottery_page', ''),
            duckduckgo=status.get('duckduckgo', '')
        ), 200, json_cors_headers()
    return jsonify(data), 200, json_cors_headers()


@app.route('/api/lotto-latest', methods=['GET', 'OPTIONS'])
@app.route('/api/lotto-latest/', methods=['GET', 'OPTIONS'])
def api_lotto_latest():
    """DuckDuckGo 검색으로 LOTTO645 최신 추첨정보 반환."""
    return _handle_lotto_latest()


# --- 정적 파일 (루트 및 하위 경로) ---
def _mimetype_with_charset(path):
    """한글 깨짐 방지: 텍스트 파일에 charset=utf-8 적용"""
    p = path.lower()
    if p.endswith('.html') or p.endswith('.htm'):
        return 'text/html; charset=utf-8'
    if p.endswith('.js'):
        return 'application/javascript; charset=utf-8'
    if p.endswith('.css'):
        return 'text/css; charset=utf-8'
    return None


@app.route('/')
def index():
    resp = send_from_directory(BASE_DIR, 'index.html')
    resp.headers['Content-Type'] = 'text/html; charset=utf-8'
    return resp


@app.route('/<path:path>')
def static_file(path):
    # API 경로: 전용 라우트가 안 걸렸을 때 여기서 처리 (trailing slash 포함)
    if path.rstrip('/') == 'api/lotto-latest':
        print('[로또] /api/lotto-latest 요청 처리 (catch-all)')
        return _handle_lotto_latest()
    if path.startswith('api/'):
        print('[404] API 경로 없음: /%s (※ python -m http.server 쓰면 404. server.py로 실행하세요)' % path)
        return jsonify(error='Not Found', hint='server.py로 서버를 실행하세요. python -m http.server는 API를 지원하지 않습니다.'), 404, json_cors_headers()
    full = (BASE_DIR / path).resolve()
    base_resolved = BASE_DIR.resolve()
    if not str(full).startswith(str(base_resolved)) or not full.is_file():
        print('[404] 파일 없음: /%s  (기대 경로: %s)' % (path, full))
        return '404 - 파일을 찾을 수 없습니다.', 404, {'Content-Type': 'text/plain; charset=utf-8'}
    resp = send_from_directory(BASE_DIR, path)
    mimetype = _mimetype_with_charset(path)
    if mimetype:
        resp.headers['Content-Type'] = mimetype
    return resp


if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() in ('1', 'true', 'yes')
    print('서버 시작: http://localhost:%s' % PORT)
    print('  메인: http://localhost:%s/' % PORT)
    print('  API 확인: http://localhost:%s/api' % PORT)
    print('  최신 추첨: http://localhost:%s/api/lotto-latest' % PORT)
    print('')
    print('  ※ Live Server(5500)로 열어도 API는 %s 로 요청됩니다.' % PORT)
    print('')
    with app.app_context():
        for r in sorted(app.url_map.iter_rules(), key=lambda x: x.rule):
            if not r.rule.startswith('/static'):
                print('  [라우트] %s %s' % (r.rule, list(r.methods - {'HEAD', 'OPTIONS'})))
    print('')
    app.run(host='0.0.0.0', port=PORT, debug=debug_mode)
