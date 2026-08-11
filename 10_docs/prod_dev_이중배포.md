# prod / dev 이중 배포 (같은 OCI 서버)

가족용 실서비스와 개발·테스트 미리보기를 **서버 1대**에서 도메인으로 나눕니다.

## 도메인 규칙 (DuckDNS)

DuckDNS는 `dev.sumicchogurashi.duckdns.org`처럼 **한 단계 더 깊은 이름**을 지원하지 않습니다.  
그래서 **DuckDNS 서브도메인을 2개** 씁니다.

| 역할 | DuckDNS 이름 (권장) | 문서상 별칭 |
| --- | --- | --- |
| 실 (prod) | `sumicchogurashi.duckdns.org` | 이미 사용 중 |
| 개발 (dev) | `sumicchogurashi-dev.duckdns.org` | “dev 서브도메인” |

둘 다 같은 Public IP `129.225.196.226`을 가리킵니다.

## 서버 디렉터리

| 경로 | 용도 |
| --- | --- |
| `/var/www/myfamily/` | prod 정적 빌드 |
| `/var/www/myfamily-dev/` | dev 정적 빌드 |
| `127.0.0.1:3001` | (나중) prod API |
| `127.0.0.1:3002` | (나중) dev API — nginx `/api/` 프록시 |

## 민호가 할 일 (아이폰·OCI 콘솔)

### 1) DuckDNS에 개발용 이름 추가

1. https://www.duckdns.org 로그인  
2. 새 서브도메인 생성: 예) `sumicchogurashi-dev`  
3. IP를 `129.225.196.226`으로 설정  
4. token은 채팅/레포에 올리지 말 것

또는 서버 `.env`에 넣고:

```bash
cd /path/to/personal-app/40_server/infra
cp .env.example .env   # 최초 1회
# DOMAIN / DEV_DOMAIN / DUCKDNS_* 편집
bash scripts/update-duckdns.sh 129.225.196.226
```

### 2) 호스트 nginx에 prod + dev 설정

레포를 서버에 클론/동기화한 뒤:

```bash
cd 40_server/infra
bash scripts/render-host-nginx.sh http
sudo mkdir -p /var/www/myfamily /var/www/myfamily-dev /var/www/certbot
sudo cp nginx/host/rendered/prod.conf /etc/nginx/sites-available/myfamily.conf
sudo cp nginx/host/rendered/dev.conf  /etc/nginx/sites-available/myfamily-dev.conf
sudo ln -sf /etc/nginx/sites-available/myfamily.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/myfamily-dev.conf /etc/nginx/sites-enabled/
# 예전 기본 사이트와 충돌하면 sites-enabled에서 비활성화
sudo nginx -t && sudo systemctl reload nginx
```

### 3) 최신 프론트를 **dev**에 배포

```bash
# 서버에서 레포 루트
git fetch && git checkout cursor/continue-latest-mockup-69de && git pull
bash 40_server/infra/scripts/deploy-static.sh dev
```

아이폰 Safari: `http://sumicchogurashi-dev.duckdns.org`  
(이 시점에는 **UI만**. API는 아직 3002를 안 띄웠으면 `/api` 실패)

### 4) HTTPS (certbot) — Face ID / Passkey에 필요

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sumicchogurashi.duckdns.org -d sumicchogurashi-dev.duckdns.org
# 또는 도메인별 발급 후
cd 40_server/infra && bash scripts/render-host-nginx.sh https
# rendered conf를 다시 sites-available에 복사하고 reload
```

Passkey 환경 변수 (dev API 프로세스):

```bash
WEBAUTHN_RP_ID=sumicchogurashi-dev.duckdns.org
WEBAUTHN_ORIGIN=https://sumicchogurashi-dev.duckdns.org
```

prod:

```bash
WEBAUTHN_RP_ID=sumicchogurashi.duckdns.org
WEBAUTHN_ORIGIN=https://sumicchogurashi.duckdns.org
```

### 5) (다음) API를 dev에만 먼저

```bash
# 예: MEMORY_AUTH=1 로 가볍게
PORT=3002 MEMORY_AUTH=1 WEBAUTHN_RP_ID=... WEBAUTHN_ORIGIN=... npm run start --workspace @personal-app/server
```

systemd 유닛은 이후 단계에서 정리.

## 배포 흐름 (정착 후)

1. 기능 개발 → PR  
2. 서버에서 `deploy-static.sh dev` (+ 필요 시 API 재시작)  
3. 아이폰으로 `dev` 확인  
4. OK면 `deploy-static.sh prod`

## 레포 파일

| 경로 | 역할 |
| --- | --- |
| `nginx/host/*.template` | 호스트 nginx prod/dev |
| `scripts/render-host-nginx.sh` | 템플릿 → rendered |
| `scripts/update-duckdns.sh` | prod+dev DuckDNS IP 갱신 |
| `scripts/deploy-static.sh` | Vite 빌드 → `/var/www/...` |

## 현재 막힌 점

- Cloud Agent에는 SSH/`90_secret` 없음 → **민호가 서버에서 위 명령 실행** 필요  
- HTTPS·API 전까지 아이폰에서는 **정적 UI만** 확인 가능
