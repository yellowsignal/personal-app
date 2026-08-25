# 인증 · 가족 초대 API

Express + JWT. DB는 Prisma(`AuthRepository`)로 붙이고, 테스트는 메모리 저장소를 사용합니다.

## Endpoints

| Method | Path | Auth | 설명 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | - | 가입. `inviteCode` 없으면 OWNER+가족 생성, 있으면 MEMBER로 합류. HttpOnly 세션 쿠키 설정 |
| `POST` | `/api/auth/login` | - | 로그인 → JWT + HttpOnly 세션 쿠키 |
| `POST` | `/api/auth/logout` | - | 세션 쿠키 삭제 |
| `GET` | `/api/auth/me` | Bearer 또는 쿠키 | 내 정보 + 가족 |
| `PATCH` | `/api/auth/me` | Bearer 또는 쿠키 | `languagePref` / `currencyPref` / `countryPref` / `name` |
| `GET` | `/api/family` | Bearer 또는 쿠키 | 가족 + 멤버 목록 |
| `POST` | `/api/family/join` | Bearer 또는 쿠키 | 초대코드로 합류 (아직 가족이 없을 때) |
| `POST` | `/api/family/invite/rotate` | Bearer 또는 쿠키 | OWNER만 초대코드 재발급 |

## Register body

```json
{
  "email": "minho@example.com",
  "password": "password123",
  "name": "민호",
  "familyName": "최가네",
  "inviteCode": "FAM-8X39A",
  "languagePref": "ko",
  "countryPref": "JP",
  "currencyPref": "JPY"
}
```

- `inviteCode`와 `familyName`은 선택. 초대코드가 있으면 기존 가족에 MEMBER로 가입.
- 응답: `{ token, user, family }`

## Auth header / cookie

```
Authorization: Bearer <token>
```

또는 로그인·가입·Passkey verify 응답의 **HttpOnly** 쿠키 `myfamilyhub_session`  
(`Path=/`, `SameSite=Lax`, HTTPS/`X-Forwarded-Proto: https` 이면 `Secure`).  
미들웨어는 Bearer를 우선하고, 없으면 쿠키를 사용합니다. 응답 JSON의 `token` 필드는 테스트·전환용으로 유지합니다.

## 로컬 실행

Postgres 없이 UI 연동 확인 (메모리 저장소):

```bash
MEMORY_AUTH=1 npm run dev:server
npm run dev:client
```

실 DB:

```bash
cd 40_server
docker compose -f docker-compose.dev.yml up -d
cp .env.example .env
npm run db:migrate
npm run dev   # MEMORY_AUTH 없이 Prisma 사용
```

## 클라이언트 연동

- `20_client` 로그인/가입 → `/api/auth/*` (`credentials: "include"`)
- JWT는 **localStorage에 두지 않음** (레거시 `myfamilyhub_token`은 부팅 시 삭제). 세션은 HttpOnly 쿠키
- 보호 라우트: 미로그인 시 `/login`
- 로그아웃: `POST /api/auth/logout` 후 클라 상태 초기화
- 설정 화면: 실사용자/가족/초대코드 · 로그아웃
