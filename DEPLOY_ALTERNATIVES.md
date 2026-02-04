# Render 대신 — Lotto645(A) / 금융거래통합정보(B) 배포 방법

Render 대시보드가 안 열릴 때 사용할 수 있는 대안입니다. A와 B를 **각각 다른 서비스/URL**로 배포합니다.

---

## 요약

| 구분 | 서비스 | 용도 | 비고 |
|------|--------|------|------|
| **A** Lotto645 | Railway | Flask 웹 앱 | GitHub 연결 → 자동 배포, 무료 크레딧 |
| **A** Lotto645 | Fly.io | Flask 웹 앱 | CLI로 배포, 무료 티어 |
| **B** 금융거래통합정보 | Vercel | 정적 사이트 | GitHub 연결, 무료 |
| **B** 금융거래통합정보 | GitHub Pages | 정적 사이트 | 저장소 설정만 하면 됨 |

---

## A (Lotto645) — Railway로 배포

이 저장소에는 이미 **Procfile**, **nixpacks.toml**이 있어 Railway에서 그대로 동작합니다.

1. [Railway](https://railway.com) 로그인 (GitHub 연동).
2. **New Project** → **Deploy from GitHub repo**.
3. **Lotto645** 저장소 선택.
4. 배포가 끝나면 해당 서비스 → **Settings** → **Networking** → **Generate Domain**.
5. 생성된 URL 예: `https://lotto645-production-xxxx.up.railway.app`

※ 결제 수단 등록이 필요할 수 있습니다. 무료 크레딧 후 사용량에 따라 과금됩니다.

---

## A (Lotto645) — Fly.io로 배포

1. [Fly.io](https://fly.io) 가입 후 [CLI 설치](https://fly.io/docs/hands-on/install-flyctl/).
2. 터미널에서 로그인:
   ```powershell
   fly auth login
   ```
3. 프로젝트 루트에서:
   ```powershell
   cd "d:\OneDrive\Cursor_AI_Project\Lotto_v200"
   fly launch
   ```
   - App name: `lotto645` 등 원하는 이름
   - Region 선택
   - PostgreSQL 등 추가 물음에는 No
4. `fly.toml`이 생성된 뒤, 웹 서비스로 실행하려면:
   ```powershell
   fly deploy
   ```
5. URL 확인:
   ```powershell
   fly open
   ```

Fly.io용 **Dockerfile**이 없으면 `fly launch`가 만들어 줄 수 있습니다. 기존에 **gunicorn**으로 실행 중이므로, Dockerfile에서 `pip install -r requirements.txt` 후 `gunicorn server:app` 실행하도록 구성하면 됩니다. (필요하면 `Dockerfile` 예시를 추가할 수 있습니다.)

---

## B (금융거래통합정보) — Vercel로 배포

### 방법 1: Lotto645 저장소에서 Root Directory만 지정

1. [Vercel](https://vercel.com) 로그인 (GitHub 연동).
2. **Add New** → **Project** → **Import** Git Repository에서 **Lotto645** 선택.
3. **Root Directory**를 **Override** → `financial-info` 입력.
4. **Framework Preset**: Other (또는 Vite 등 무관 – 정적 HTML만 있음).
5. **Deploy** 클릭.
6. 배포 후 URL 예: `https://financial-info-xxxx.vercel.app`

### 방법 2: B만 별도 저장소로 푸시 후 Vercel 연결

1. GitHub에서 새 저장소 생성 (예: `financial-info`).
2. 로컬에서:
   ```powershell
   mkdir financial-info-repo
   Copy-Item "d:\OneDrive\Cursor_AI_Project\Lotto_v200\financial-info\*" "financial-info-repo\"
   cd financial-info-repo
   git init
   git add .
   git commit -m "금융거래 통합정보 정적 페이지"
   git branch -M main
   git remote add origin https://github.com/본인아이디/financial-info.git
   git push -u origin main
   ```
3. Vercel → **Add New** → **Project** → **financial-info** 저장소 선택 → **Deploy**.

---

## B (금융거래통합정보) — GitHub Pages로 배포

B만 별도 저장소로 두고 Pages를 켜는 방법입니다.

1. GitHub에서 새 저장소 생성 (예: `financial-info`), README 추가 안 함.
2. 위 "방법 2"처럼 `financial-info` 폴더 내용만 새 폴더에 복사 후 푸시:
   ```powershell
   mkdir financial-info-repo
   Copy-Item "d:\OneDrive\Cursor_AI_Project\Lotto_v200\financial-info\*" "financial-info-repo\"
   cd financial-info-repo
   git init
   git add .
   git commit -m "금융거래 통합정보"
   git branch -M main
   git remote add origin https://github.com/본인아이디/financial-info.git
   git push -u origin main
   ```
3. GitHub **financial-info** 저장소 → **Settings** → **Pages**.
4. **Source**: Deploy from a branch  
   **Branch**: main, **Folder**: / (root) → **Save**.
5. 잠시 후 접속: `https://본인아이디.github.io/financial-info/`

---

## 배포 후 Lotto645에 B 링크 넣기

B를 어디에 배포했든, **B의 실제 URL**을 Lotto645 쪽에 넣으면 됩니다.

1. **index.html**에서 `id="financial-info-link"` 인 `<a>` 찾기.
2. **data-url**에 B URL 넣기.  
   - Vercel: `data-url="https://financial-info-xxxx.vercel.app"`
   - GitHub Pages: `data-url="https://본인아이디.github.io/financial-info/"`
3. 저장 후 A(Lotto645) 저장소 커밋·푸시.

---

## 한 줄 요약

- **A (Lotto645)**: Railway 또는 Fly.io로 배포 (이미 Procfile/nixpacks 있음).
- **B (금융거래통합정보)**: Vercel(같은 repo Root `financial-info`) 또는 GitHub Pages(별도 repo)로 배포.
- B URL을 **index.html**의 `data-url`에 넣으면 Lotto645 푸터에 "금융거래 통합정보" 링크가 표시됩니다.
