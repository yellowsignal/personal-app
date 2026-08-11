# 인증 · 가족 초대 API

Express + JWT. DB는 Prisma(`AuthRepository`)로 붙이고, 테스트는 메모리 저장소를 사용합니다.

## Endpoints

| Method | Path | Auth | 설명 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | - | 가입. `inviteCode` 없으면 OWNER+가족 생성, 있으면 MEMBER로 합류 |
| `POST` | `/api/auth/login` | - | 로그인 → JWT |
| `GET` | `/api/auth/me` | Bearer | 내 정보 + 가족 |
| `PATCH` | `/api/auth/me` | Bearer | `languagePref` / `currencyPref` / `countryPref` / `name` |
| `GET` | `/api/family` | Bearer | 가족 + 멤버 목록 |
| `POST` | `/api/family/join` | Bearer | 초대코드로 합류 (아직 가족이 없을 때) |
| `POST` | `/api/family/invite/rotate` | Bearer | OWNER만 초대코드 재발급 |

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

## Auth header

```
Authorization: Bearer <token>
```

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

- `20_client` 로그인/가입 → `/api/auth/*`
- JWT는 `localStorage` (`myfamilyhub_token`)
- 보호 라우트: 미로그인 시 `/login`
- 설정 화면: 실사용자/가족/초대코드 · 로그아웃
- 자산 등 나머지 화면은 아직 mock 데이터
