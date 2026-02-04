# A(Lotto645) + B(금융거래통합정보) 각각 배포 가이드

- **A**: 로또 앱 (Flask) — 이 저장소 **루트**
- **B**: 금융거래 통합정보 페이지 — `financial-info/` 폴더 (정적 HTML)

**Railway로 배포** → **[DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)** (대시보드 + CLI 단계).

**Render 대시보드가 안 열릴 때** → **[DEPLOY_ALTERNATIVES.md](DEPLOY_ALTERNATIVES.md)** 참고 (Railway, Vercel, GitHub Pages, Fly.io).

---

## A와 B 각각 배포 요약

| 구분 | 경로 | 배포 대상 | 용도 |
|------|------|-----------|------|
| **A** | 저장소 루트 | Railway 또는 Render Web Service | Lotto645 로또 앱 |
| **B** | `financial-info/` | Render Static Site / Vercel / GitHub Pages | 금융거래 통합정보 페이지 |

---

## 1. Git 커밋

프로젝트 루트에서:

```powershell
# 배포용 파일 포함 전체 스테이징
git add .

# 커밋 (원하는 메시지로 수정 가능)
git commit -m "Railway 배포 설정 추가 (Procfile, nixpacks.toml, runtime.txt)"
```

## 2. GitHub 저장소 (Lotto645)

### 새 저장소로 푸시하는 경우

1. [GitHub](https://github.com/new)에서 **New repository** 생성
2. **Repository name**: `Lotto645`
3. Public 선택, **README / .gitignore / license 추가하지 않음** (이미 로컬에 있음)
4. 생성 후 나오는 안내대로 **기존 로컬 저장소에 remote 추가 후 푸시**:

```powershell
# 이미 origin이 있으면 URL만 Lotto645 저장소로 변경
git remote set-url origin https://github.com/본인아이디/Lotto645.git

# 또는 새 remote 사용 시
# git remote add github https://github.com/본인아이디/Lotto645.git

git push -u origin main
```

### 기존 저장소 이름을 Lotto645로 바꾸는 경우

1. GitHub 저장소 **Settings** → **General** → **Repository name**을 `Lotto645`로 변경 후 **Rename**
2. 로컬에서 원격 URL 갱신 후 푸시:

```powershell
git remote set-url origin https://github.com/본인아이디/Lotto645.git
git push origin main
```

## 3. Railway에 Lotto645로 배포

1. [Railway](https://railway.com) 로그인 후 **New Project**
2. **Deploy from GitHub repo** 선택
3. **GitHub 연동** 후 저장소 **Lotto645** 선택
4. 배포가 자동으로 시작됨 (Nixpacks가 Python + `nixpacks.toml`/`Procfile` 인식)
5. **서비스 이름을 Lotto645로 설정** (선택):
   - 해당 서비스 클릭 → **Settings** → **Service Name**을 `Lotto645`로 입력
6. **공개 URL 생성**:
   - **Settings** → **Networking** → **Generate Domain** 클릭  
   - 생성된 URL(예: `lotto645-production.up.railway.app`)로 접속

## 4. 배포 후 확인

- 메인 페이지: `https://생성된도메인/`
- API 확인: `https://생성된도메인/api`
- 최신 추첨: `https://생성된도메인/api/lotto-latest`

## 5. 참고

| 파일 | 역할 |
|------|------|
| `Procfile` | `web: gunicorn server:app --bind 0.0.0.0:$PORT` — Railway/Heroku 스타일 실행 |
| `nixpacks.toml` | Railway 권장 빌드 설정 (동일 명령 사용) |
| `runtime.txt` | Python 버전 명시 (선택, Nixpacks가 대체 가능) |

`PORT`는 Railway가 자동으로 설정하므로 별도 환경 변수 설정 없이 동작합니다.

---

## 5-2. A+B 한 번에 배포 (render.yaml Blueprint)

이 저장소 루트에 **render.yaml**이 있습니다. Render에서 한 번만 적용하면 A·B 두 서비스가 각각 생성됩니다.

1. [Render](https://dashboard.render.com/select-repo?type=blueprint) → **New** → **Blueprint** (또는 "Connect repository").
2. **Lotto645** 저장소 선택 후 연결.
3. Render가 `render.yaml`을 읽어 **Lotto645**(웹 서비스)와 **financial-info**(정적 사이트) 두 서비스를 제안합니다.
4. **Apply** 클릭 → 두 서비스가 생성되고, 각각 별도 URL이 부여됩니다.

---

## 6. A(Lotto645) 배포 (정리)

1. 이 저장소(Lotto645) **루트**를 Railway 또는 Render에 연결해 배포.
2. **Railway**: New Project → Deploy from GitHub repo → **Lotto645** 선택 → Generate Domain.
3. **Render**: New → Web Service → Repo **Lotto645** 연결, Root Directory **비움(루트)** → Deploy.

---

## 7. B(금융거래통합정보) 배포 — 각각 별도로

B는 `financial-info/` 폴더 하나의 **정적 HTML**이므로, 아래 중 하나로 **별도 서비스**로 배포하면 됩니다.

### 방법 1: 같은 저장소(Lotto645)에서 Root Directory만 다르게 (Render)

1. [Render](https://render.com) 로그인 → **New** → **Static Site**.
2. **Connect repository**: **Lotto645** 선택.
3. **Root Directory**에 `financial-info` 입력.
4. **Build Command**: 비움 (정적 HTML만 있음).
5. **Publish Directory**: `.` 또는 비움.
6. **Create Static Site** → 배포 완료 후 URL 생성 (예: `financial-info-xxxx.onrender.com`).

### 방법 2: B만 별도 GitHub 저장소로 푸시 후 배포

1. GitHub에서 새 저장소 생성 (예: `financial-info` 또는 `금융거래통합정보`).
2. 로컬에서 B만 새 폴더로 복사한 뒤 전용 repo로 푸시:

```powershell
mkdir financial-info-repo
copy financial-info\* financial-info-repo\
cd financial-info-repo
git init
git add .
git commit -m "금융거래 통합정보 정적 페이지"
git remote add origin https://github.com/본인아이디/financial-info.git
git push -u origin main
```

3. Render / Vercel / GitHub Pages 중 하나에서 **financial-info** 저장소 연결 후 정적 사이트로 배포.

### 방법 3: GitHub Pages (B만 별도 repo인 경우)

1. B 전용 repo 푸시 후, 해당 repo **Settings** → **Pages**.
2. Source: **Deploy from a branch** → Branch: **main** → Folder: **/ (root)** → Save.
3. `https://본인아이디.github.io/financial-info/` 로 접속.

---

## 8. 배포 후 사용

- **A**: Lotto645 앱 URL (예: `https://lotto645-xxxx.onrender.com`).
- **B**: 금융거래 통합정보 URL (예: `https://financial-info-xxxx.onrender.com`).

### Lotto645 푸터에 B(금융거래통합정보) 링크 넣기

1. **index.html**에서 `id="financial-info-link"`인 `<a>` 태그를 찾습니다.
2. **data-url** 속성에 B의 실제 URL을 넣습니다.  
   예: `data-url="https://financial-info-xxxx.onrender.com"`
3. 저장 후 커밋·푸시하면 A(Lotto645) 배포에 반영됩니다.  
   - `data-url`이 비어 있으면 푸터에 "금융거래 통합정보" 링크는 표시되지 않습니다.
