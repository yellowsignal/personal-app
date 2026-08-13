# Agent instructions — MyFamily Hub (`personal-app`)

이 저장소에서 작업하는 **모든 코딩 에이전트**(Cursor Cloud/Desktop, Copilot, 기타)는 아래를 따른다.

## 필수 문서

1. 착수 전 **`10_docs/작업내용.md`** 를 읽고 현재 상태·다음 우선순위를 파악한다.
2. 제품 요구는 `10_docs/기획서.md`, `10_docs/프롬프트.md` 를 기준으로 한다.
3. 작업이 끝나면 **`10_docs/작업내용.md` 를 갱신**한다 (완료 체크, 막힌 점, 다음 할 일, 날짜).

## 프로젝트 사실

- Monorepo: `20_client` (React/Vite), `40_server` (Express/Prisma), `30_data`, `10_docs`
- npm workspaces 경로는 **`20_client` / `40_server`** (옛 `client`/`server` 이름 쓰지 말 것)
- 임시 공개 목업: `http://sumicchogurashi.duckdns.org` → OCI `129.225.196.226`
- 로컬 인증 UI 테스트: `MEMORY_AUTH=1` (Postgres 없이 가능)
- HTTPS·서버 SSH는 사용자 환경(주로 아이폰) 제약으로 보류될 수 있음

## 작업 원칙

- 사용자 메인 환경은 **아이폰** — PC 전제(PowerShell 경로, 로컬 SSH 키 필수 등)를 기본으로 잡지 말 것
- 비밀값(DuckDNS token, SSH key, JWT/DB 비밀번호)을 커밋·채팅에 남기지 말 것
- 목업 UI와 실 API를 섞을 때: 인증은 API 연동됨, 자산/구독 등은 아직 mock — 문서와 코드 주석을 맞출 것
- 불필요한 대규모 리팩터·문서 남발 금지. `10_docs/작업내용.md`와 관련 전용 문서만 갱신
- PR/브랜치 작업 시 기존 Cloud Agent 브랜치 규칙을 존중하고, 의미 있는 단위로 커밋

## 응답 마무리 (필수)

클라이언트·서버·마이그레이션 등 **배포가 필요한 변경**을 한 턴의 마지막 사용자 응답에는, 본문과 별도로 **복사해 실행할 dig 배포 명령을 반드시 한 줄로 붙인다.**

```bash
bash ~/personal-app/40_server/infra/scripts/deploy-dig.sh
```

- Cloud Agent는 SSH/`90_secret`이 없어 서버 배포를 대신 실행하지 못한다. 민호가 서버(또는 dig 환경)에서 위 명령을 실행한다.
- 문서-only / 규칙-only처럼 dig 재배포가 불필요해도, 습관 유지를 위해 같은 명령을 끝에 적어도 된다.
- prod promote는 dig 검증 후 `deploy-static.sh prod` 등 별도 절차를 따른다 (`10_docs/prod_dev_이중배포.md`).

## Cursor

- 추가 규칙은 `.cursor/rules/*.mdc` 에 있다 (`alwaysApply` 포함).
- 공통 지침은 이 파일(`AGENTS.md`)과 `10_docs/작업내용.md` 를 기준으로 한다.
