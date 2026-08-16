# DB 스키마 (PostgreSQL + Prisma)

기획서 DDL을 Prisma로 옮긴 상태입니다. 위치: `40_server/prisma/schema.prisma`

## 테이블

| 테이블 | 모델 | 역할 |
| --- | --- | --- |
| `families` | `Family` | 가족 그룹 + 초대코드 |
| `family_icloud_albums` | `FamilyIcloudAlbum` | 가족이 연결한 iCloud 공유 앨범 URL (사진은 서버에 저장하지 않음) |
| `users` | `User` | 계정, 언어/국가/표시통화, 역할(OWNER/MEMBER) |
| `assets` | `Asset` | 자산·주식. 예금은 계좌번호·비밀번호 + JP 은행/지점 코드·이름 |
| `documents` | `Document` | 증명서·신분증 |
| `subscriptions` | `Subscription` | 구독 |
| `transactions` | `Transaction` | 수입/지출 |
| `photos` | `Photo` | 사진 |
| `calendar_events` | `CalendarEvent` | 일정 + 증명서 만료 연동 |
| `checklists` | `Checklist` | 체크리스트 (제목·가족 공유) |
| `checklist_items` | `ChecklistItem` | 트리 항목 (`parent_id` 자기참조, `completed_at`·30일 후 purge) |

공통: 도메인 테이블에 `is_shared` (개인 vs 가족 공유).

## 로컬에서 올리기

Cloud Agent / PC에 Docker가 있을 때:

```bash
cd 40_server
docker compose -f docker-compose.dev.yml up -d
cp .env.example .env
npm run db:migrate    # prisma migrate deploy
npm run db:generate   # 클라이언트 재생성
```

초기 마이그레이션 SQL: `prisma/migrations/20260811043000_init/`.

## 다음 단계

- 인증(가입/로그인) + 가족 초대코드 API
- Prisma로 도메인 CRUD (목업 데이터 대체)
