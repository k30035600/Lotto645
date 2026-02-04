# -*- coding: utf-8 -*-
"""
DuckDuckGo 검색으로 로또 당첨번호 조회 (독립 실행 스크립트)
사용: python get_lotto_numbers.py      → 최신 회차 조회
     python get_lotto_numbers.py 1207  → 1207회 검색 (검색 결과에서 파싱 시도)
"""
import sys
import re

# Windows 콘솔 출력 인코딩 설정 (한글 깨짐 방지)
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, OSError):
    pass


def _parse_lotto_from_text(text):
    """텍스트에서 로또 당첨번호 파싱."""
    if not text or len(text) < 10:
        return None
    text = re.sub(r'\s+', ' ', text)
    round_m = re.search(r'(\d{3,5})\s*회', text)
    drw_no = int(round_m.group(1)) if round_m else None
    nums = re.findall(r'\b([1-9]|[1-3]\d|4[0-5])\b', text)
    nums = [int(n) for n in nums]
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
            for x in unique[7:]:
                if x != bonus and 1 <= x <= 45:
                    bonus = x
                    break
        if len(main) == 6 and 1 <= bonus <= 45 and bonus not in main:
            return {'drwNo': drw_no, 'main': main, 'bnusNo': bonus}
    main_m = re.search(r'(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})\s*[,·]\s*(\d{1,2})', text)
    if main_m:
        main = sorted([int(main_m.group(i)) for i in range(1, 7)])
        if all(1 <= n <= 45 for n in main) and len(set(main)) == 6:
            bonus_m = re.search(r'보너스\s*[:]?\s*(\d{1,2})|\+\s*(\d{1,2})', text)
            bonus = None
            if bonus_m:
                for g in bonus_m.groups():
                    if g:
                        b = int(g)
                        if 1 <= b <= 45 and b not in main:
                            bonus = b
                            break
            if bonus:
                return {'drwNo': drw_no, 'main': main, 'bnusNo': bonus}
    return None


def get_lotto_numbers(search_target=None):
    """
    DuckDuckGo 검색으로 당첨번호 조회.
    search_target: None이면 '로또645 최신 당첨번호', 숫자면 '로또 N회 당첨번호' 검색.
    """
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            print("[Error] ddgs 패키지가 필요합니다. pip install ddgs")
            return None

    if search_target:
        q = f"로또645 {search_target}회 당첨번호"
    else:
        q = "로또645 최신 당첨번호"
    queries = [q, "동행복권 당첨결과", "로또 645 당첨번호"]
    combined = []
    try:
        with DDGS() as ddgs:
            for query in queries:
                results = list(ddgs.text(query, region='kr-kr', max_results=5))
                for r in results:
                    combined.append((r.get('title') or '') + ' ' + (r.get('body') or ''))
                if combined:
                    break
    except Exception as e:
        print(f"[Error] DuckDuckGo 검색 실패: {e}")
        return None

    for block in combined:
        parsed = _parse_lotto_from_text(block)
        if parsed:
            return {
                'returnValue': 'success',
                'drwNo': parsed.get('drwNo'),
                'drwtNo1': parsed['main'][0], 'drwtNo2': parsed['main'][1],
                'drwtNo3': parsed['main'][2], 'drwtNo4': parsed['main'][3],
                'drwtNo5': parsed['main'][4], 'drwtNo6': parsed['main'][5],
                'bnusNo': parsed['bnusNo']
            }
    return None


if __name__ == "__main__":
    drw_no = None
    if len(sys.argv) >= 2:
        try:
            drw_no = int(sys.argv[1])
        except ValueError:
            print("회차는 숫자로 입력하세요. 예: python get_lotto_numbers.py 1207")
            sys.exit(1)

    lotto = get_lotto_numbers(drw_no)

    if lotto:
        print(f"--- {lotto.get('drwNo', '?')}회 로또 결과 ---")
        print(f"당첨번호: {lotto['drwtNo1']}, {lotto['drwtNo2']}, {lotto['drwtNo3']}, "
              f"{lotto['drwtNo4']}, {lotto['drwtNo5']}, {lotto['drwtNo6']}")
        print(f"보너스번호: {lotto['bnusNo']}")
    else:
        print("당첨번호를 찾지 못했습니다.")
