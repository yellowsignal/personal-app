# prod / dig 이중 배포 (같은 OCI 서버)

가족용 **실서비스(prod)** 와 **개발·테스트(dig)** 를 서버 1대에서 도메인·DB·파일로 나눕니다.

## 결론 (민호 질문에 대한 답)

| 질문 | 답 |
| --- | --- |
| dig DB 데이터를 실서버로? | **1회** `clone-dig-to-prod.sh` 로 dig → prod 복제 |
| 스키마를 분리하면 되나? | **테이블 구조(Prisma 마이그레이션)는 동일**. 분리할 것은 **데이터베이스 인스턴스(또는 DB)** 와 **파일 디렉터리·systemd·도메인** |
| 이후 개발 흐름? | 기능 → dig 배포·검증 → OK면 prod 배포 |

같은 Postgres 안에 `public` / `dig` 스키마만 나누는 방식은 **추천하지 않습니다**.  
마이그레이션·백업·실수 방지·비밀번호 격리를 위해 **포트/볼륨이 다른 DB 2개**가 안전합니다.

## 도메인

| 역할 | DuckDNS | 정적 루트 | API |
| --- | --- | --- | --- |
| prod | `sumicchogurashi.duckdns.org` | `/var/www/myfamilyhub` (nginx: `sites-enabled/myfamilyhub`) | `127.0.0.1:3001` (`myfamilyhub-api`) |
| dig | `sumicchogurashi-dev.duckdns.org` | `/var/www/myfamilyhub-dev` | `127.0.0.1:3002` (`myfamilyhub-dev-api`) |

> 주의: 레포 템플릿의 `/var/www/myfamily` 는 이 서버에서 **사용하지 않습니다**. Certbot이 만든 `myfamilyhub` conf가 실서비스입니다.

둘 다 Public IP `129.225.196.226`을 가리킵니다.

## DB·파일 분리

| | dig | prod |
| --- | --- | --- |
| Compose | `docker-compose.dig.yml` | `docker-compose.prod.yml` |
| Listen | `127.0.0.1:5432` | `127.0.0.1:5433` |
| Env file | `40_server/.env` | `40_server/.env.prod` |
| Photos 등 | `30_data/photos` 등 | `30_data/prod/...` |
| Prisma | **같은** `prisma/migrations` | **같은** `prisma/migrations` |

스키마 **내용**은 항상 동일하게 `prisma migrate deploy` 로 맞춥니다.  
다른 것은 **데이터**와 **접속 URL**입니다.

### Passkey / 암호화 주의

- WebAuthn은 **도메인(RP ID)에 묶입니다**. dig에서 등록한 Face ID는 prod 도메인에서 **동작하지 않습니다**.
- dig → prod 복제 후에도 prod에서 **Passkey 재등록**(초대/부트스트랩)이 필요합니다.
- 구독 비밀번호 AES는 dig의 `JWT_SECRET`(또는 `CREDENTIALS_ENCRYPTION_KEY`)로 암호화되어 있으면, 복호화가 필요하면 **같은 키를 prod `.env.prod`에** 넣습니다.
- 푸시: `clone-dig-to-prod.sh`가 dig `vapid.json`을 prod로 복사합니다(기존 구독 유지용).

---

## 최초 1회: dig → prod 올리기

서버(Termius)에서 순서대로:

### 1) 레포 최신 + dig에 마이그레이션 반영

```bash
cd ~/personal-app
git fetch && git checkout cursor/continue-latest-mockup-69de && git pull
bash 40_server/infra/scripts/deploy-dig.sh
```

### 2) prod Postgres + systemd

```bash
bash ~/personal-app/40_server/infra/scripts/setup-prod-postgres.sh
# 생성된 40_server/.env.prod 비밀번호·JWT 확인
```

### 3) dig 데이터·파일 복제

```bash
bash ~/personal-app/40_server/infra/scripts/clone-dig-to-prod.sh
```

### 4) nginx prod `/api/` → 3001

HTTPS 템플릿에 프록시가 켜져 있습니다. 서버에 반영:

```bash
cd ~/personal-app/40_server/infra
bash scripts/render-host-nginx.sh https
sudo cp nginx/host/rendered/prod.conf /etc/nginx/sites-available/myfamily.conf
sudo nginx -t && sudo systemctl reload nginx
```

이미 수동으로 만든 conf만 쓰는 경우, prod server 블록에 아래를 넣고 reload:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 5) prod 프론트·API 배포

```bash
bash ~/personal-app/40_server/infra/scripts/deploy-prod.sh
```

### 6) 아이폰에서 확인

1. `https://sumicchogurashi.duckdns.org` 열기  
2. Passkey **다시** 등록/로그인  
3. 캘린더·자산·사진 등 dig와 같은 데이터가 보이는지 확인  

---

## 이후 일상 배포 (개발 → dig → prod)

1. 기능 개발·PR·머지 (또는 dig 추적 브랜치에 push)  
2. **dig만** 배포·검증:

```bash
bash ~/personal-app/40_server/infra/scripts/deploy-dig.sh
```

3. 아이폰으로 `https://sumicchogurashi-dev.duckdns.org` 확인  
4. OK면 **prod**에 동일 커밋 적용:

```bash
bash ~/personal-app/40_server/infra/scripts/deploy-prod.sh
```

각 스크립트가 해당 env의 `prisma migrate deploy`를 돌리므로, **마이그레이션은 dig 먼저 → 검증 → prod** 순이 됩니다.  
데이터를 다시 통째로 덮어쓸 필요는 없습니다(최초 복제 이후는 각자 쌓임).

---

## 스크립트 목록

| 경로 | 역할 |
| --- | --- |
| `scripts/setup-dig-postgres.sh` | dig DB + `myfamilyhub-dev-api` |
| `scripts/deploy-dig.sh` | dig 전체 배포 |
| `scripts/setup-prod-postgres.sh` | prod DB(:5433) + `myfamilyhub-api` |
| `scripts/clone-dig-to-prod.sh` | dig → prod DB·파일 **1회** 복제 |
| `scripts/deploy-prod.sh` | prod 전체 배포 |
| `scripts/deploy-static.sh prod\|dev` | 프론트만 |
| `scripts/transfer-personal-to-new-user.sh` | Passkey 재가입 후 동일 이름 dig 유저 → 새 user_id 로 개인 행 이관 |
| `scripts/remove-stale-family-users.sh` | 컷오버 후 남은 옛 유저 삭제(대시보드에 4명처럼 보일 때). `--list` → `--keep` dry-run → `--apply` |

### Passkey 재가입 후 멤버가 4명으로 보일 때

dig 시절 유저(예: id 1·2)가 같은 `family_id`에 남아 있으면 홈 아바타·설정「N명 참여」가 부풀려집니다. **새 Passkey 유저 id만 남기고** 삭제하세요.

```bash
# 현황
bash ~/personal-app/40_server/infra/scripts/remove-stale-family-users.sh --env prod --list

# dry-run (예: 유지 3,4 / 나머지 삭제)
bash ~/personal-app/40_server/infra/scripts/remove-stale-family-users.sh --env prod --keep 3,4

# 실행
bash ~/personal-app/40_server/infra/scripts/remove-stale-family-users.sh --env prod --keep 3,4 --apply
```

이름이 달라 자동 이관이 안 되면 `--map 1:3,2:4` 를 붙입니다. dig DB도 같으면 `--env dig`.

## Cloud Agent 제약

SSH/`90_secret` 없음 → **민호가 OCI에서 위 명령 실행**. Agent는 스크립트·문서만 레포에 둡니다.
