# E2E 금고 (제로널리지) 설계 — B안

서버는 **평문 비밀번호를 저장·복호화하지 않는다**. 암호문은 클라이언트(WebCrypto)에서만 만들고 풀며, Face ID는 “열람 권한” 확인용으로 유지한다.

## 목표

1. DB/서버 유출 시에도 구독·예금·vault 비밀번호 평문 불가
2. **가족 공유** 유지: 가족 DEK를 멤버 공개키로 전달
3. **폰 교체**: 금고 비밀번호(패스프레이즈)만 알면 새 기기에서 키 복구 (서버에 래핑된 키 패키지 보관)
4. 기존 서버 AES 암호문(`legacy`)은 reveal 시 서버 복호화 유지 → 열람 후 클라가 E2E로 재암호화(점진 이전)

## 키 계층

| 키 | 위치 | 역할 |
| --- | --- | --- |
| 금고 패스프레이즈 | 사용자 기억 (서버 저장 안 함) | KEK 유도 |
| KEK | 메모리만 (세션) | PBKDF2(패스프레이즈, salt) |
| Personal DEK | 서버에 KEK로 래핑되어 저장 | 개인 비밀 암호화 |
| Family DEK | 멤버별 KEK 래핑 + 신규 멤버에게 RSA-OAEP 전달 | 공유 비밀 암호화 |
| RSA 키쌍 | 개인키는 KEK 래핑, 공개키는 서버 | 가족 DEK 배포 |

## 암호문 포맷

```
e2e1.<scope>.<base64url(iv12 || tag16 || ciphertext)>
```

- `scope`: `p` = personal DEK, `f` = family DEK
- 구버전 서버 AES(base64url only)는 `legacy`로 취급

## API

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/vault-keys/me` | 내 키 패키지(래핑본) + pending family DEK delivery |
| PUT | `/api/vault-keys/setup` | 최초 금고 설정 |
| GET | `/api/vault-keys/family` | 멤버별 hasFamilyDek / publicKey |
| POST | `/api/vault-keys/deliver-family` | 가족 DEK를 상대 공개키로 암호화해 전달 |
| POST | `/api/vault-keys/accept-family` | 전달받은 DEK를 KEK로 재래핑해 저장 |

비밀 저장: 클라가 `loginPassword` 평문 대신 **이미 E2E인** `loginPasswordCipher` 전송.  
Reveal: Passkey 성공 후 `{ encryption, passwordCipher?, password? }` — E2E면 cipher만.

## UX

1. 설정 → **금고 설정**: 패스프레이즈 생성(최초) / 잠금 해제
2. 비밀 저장·열람 전 금고 잠금 해제 필요
3. 새 가족 멤버가 금고를 만들면, 기존 멤버가 잠금 해제 상태에서 **가족 키 전달**

## 비범위 (이후)

- WebAuthn PRF로 패스프레이즈 대체
- 증명서 필드·계좌번호까지 E2E
- 패스프레이즈 복구 퀴즈 / 인쇄 백업 문구
