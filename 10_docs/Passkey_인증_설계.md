# Passkey(WebAuthn) 인증 설계 — A안

가족 2~3명용 **닫힌 가입 + Passkey(Face ID) 로그인**을 기본으로 한다.

## 목표

1. URL을 아는 사람이 **임의로 가족/계정을 만들 수 없음** (가입 폐쇄)
2. OWNER가 **1회용 초대 토큰**을 발급 → 가족만 Passkey 등록
3. 이후 로그인은 **Face ID / Touch ID**(discoverable passkey) 중심
4. 비밀번호 로그인은 **개발·전환기 fallback** (추후 제거 가능)

## 흐름

### 최초 OWNER (bootstrap)

DB에 사용자가 0명일 때만:

1. `POST /api/auth/passkey/register/options` `{ flow: "bootstrap", name, familyName? }`
2. Face ID / Touch ID 등록
3. `POST /api/auth/passkey/register/verify` → JWT + user + family

### 가족 초대 (1회용 토큰)

1. OWNER: `POST /api/family/invite/create` → `{ token, expiresAt }` (평문 토큰은 이때만)
2. 카톡/대면으로 토큰 전달 (또는 `/join?token=...` 링크)
3. 초대받은 사람: `register/options` `{ flow: "invite", inviteToken, name }`
4. Passkey 등록 → `register/verify` → JWT
5. 토큰 `used_at` 기록, 재사용 불가

### 로그인

1. `POST /api/auth/passkey/login/options`
2. Face ID
3. `POST /api/auth/passkey/login/verify` → JWT

discoverable passkey(resident key)를 사용하므로 **이메일 입력 없이** 기기 생체인증만으로 로그인 가능.

### 기존 비밀번호 계정 → Passkey 연결

로그인 상태에서:

- `POST /api/auth/passkey/link/options`
- `POST /api/auth/passkey/link/verify`

## API 요약

| Method | Path | Auth | 설명 |
| --- | --- | --- | --- |
| POST | `/api/auth/passkey/register/options` | - | bootstrap / invite 등록 시작 |
| POST | `/api/auth/passkey/register/verify` | - | 등록 완료 → JWT |
| POST | `/api/auth/passkey/login/options` | - | 로그인 시작 |
| POST | `/api/auth/passkey/login/verify` | - | 로그인 완료 → JWT |
| POST | `/api/auth/passkey/link/options` | Bearer | 기존 계정에 Passkey 추가 |
| POST | `/api/auth/passkey/link/verify` | Bearer | 연결 완료 |
| POST | `/api/family/invite/create` | Bearer (OWNER) | 1회용 초대 토큰 발급 |

비밀번호 API(`/api/auth/register|login`)는 유지하되, **invite 없는 register는 사용자 존재 시 403**.

## 데이터

- `passkey_credentials` — WebAuthn 공개키, counter, credential id
- `invite_tokens` — SHA-256 해시, 만료(기본 48h), 1회 사용

Passkey 전용 사용자는 내부 이메일 `{id}@passkey.myfamily` 형식 (표시는 `name`).

## WebAuthn 환경 변수

| 변수 | 예시 | 설명 |
| --- | --- | --- |
| `WEBAUTHN_RP_ID` | `localhost` / `sumicchogurashi.duckdns.org` | RP ID (도메인) |
| `WEBAUTHN_RP_NAME` | `MyFamily Hub` | 표시 이름 |
| `WEBAUTHN_ORIGIN` | `http://localhost:5173` | 클라이언트 origin |

**HTTPS 배포 전**에는 iPhone 실기기 Face ID 테스트가 제한될 수 있음. 로컬·Cloud Agent에서는 브라우저 WebAuthn 시뮬레이션 또는 Mac/HTTPS 환경에서 검증.

## 보안 메모

- 초대 토큰: 서버에는 해시만 저장, 기본 48시간 만료
- JWT: 기존과 동일 Bearer, 추후 httpOnly cookie 전환 검토
- `/api/tasks` 등 스타터 엔드포인트: 프로덕션 배포 전 비활성화 예정
- 영구 `FAM-XXXXX` 코드: 설정 화면 참고용 유지, **신규 가입은 1회 토큰 권장**

## 구현 단계

- [x] 1단계: Passkey API + 1회 초대 + 가입 폐쇄 + 로그인 UI
- [ ] 2단계: HTTPS 배포 + RP ID 프로덕션 설정
- [ ] 3단계: 비밀번호 가입 제거, httpOnly 세션
