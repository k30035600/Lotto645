# Railway 배포 — Lotto645 + 금융거래 통합정보

GitHub 푸시까지 완료된 상태에서 Railway로 배포하는 방법입니다.

---

## 방법 1: Railway 웹 대시보드 (권장)

### Lotto645

1. [railway.com](https://railway.com) 로그인 (GitHub 연동).
2. **New Project** → **Deploy from GitHub repo**.
3. **Lotto645** 저장소 선택 → 배포 자동 시작.
4. 배포 완료 후: **Settings** → **Networking** → **Generate Domain**.
5. 접속: `https://생성된도메인.up.railway.app`

### 금융거래 통합정보

1. **New Project** (또는 같은 프로젝트에서 **New** → **GitHub Repo**).
2. **financial-info** 저장소 선택 → 배포 자동 시작.
3. **Settings** → **Networking** → **Generate Domain**.
4. 접속: `https://생성된도메인.up.railway.app`

---

## 방법 2: Railway CLI

CLI는 한 번 로그인·연결 후 `railway up`으로 배포할 수 있습니다.

### 1) 로그인 (최초 1회, 터미널에서 직접 실행)

```powershell
railway login
```

브라우저가 열리면 로그인을 완료하세요.

### 2) Lotto645 배포

```powershell
cd "d:\OneDrive\Cursor_AI_Project\Lotto_v200"
railway link
```

- **Create new project** 선택 후 프로젝트 이름 입력 (예: Lotto645).
- 서비스가 생성되면:

```powershell
railway up
```

- 도메인 생성: Railway 대시보드에서 해당 서비스 → **Settings** → **Networking** → **Generate Domain**.

### 3) 금융거래 통합정보 배포

```powershell
cd "d:\OneDrive\Cursor_AI_Project\financial-info"
railway link
```

- **Create new project** 또는 기존 프로젝트 선택.
- 서비스 연결 후:

```powershell
railway up
```

- 도메인 생성: 대시보드에서 **Generate Domain**.

### 4) 이후 재배포

두 저장소 모두 코드 수정 후:

```powershell
# Lotto645
cd "d:\OneDrive\Cursor_AI_Project\Lotto_v200"
git add . ; git commit -m "update" ; git push
railway up

# 금융거래 통합정보
cd "d:\OneDrive\Cursor_AI_Project\financial-info"
git add . ; git commit -m "update" ; git push
railway up
```

GitHub에 푸시한 뒤 Railway 대시보드에서 **Deploy from GitHub**로 연결해 두었다면, 푸시만 해도 자동 재배포됩니다.

---

## 배포 후: Lotto645에 금융거래 링크 넣기

금융거래 통합정보 Railway URL을 알게 되면:

1. **Lotto_v200/index.html**에서 `id="financial-info-link"`인 `<a>` 찾기.
2. **data-url**에 금융거래 URL 넣기.  
   예: `data-url="https://financial-info-production-xxxx.up.railway.app"`
3. 저장 후 커밋·푸시하면 Lotto645 배포에 반영됩니다.
