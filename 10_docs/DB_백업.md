# DB 일일 백업 → PC(`E:\personal-app\50_backup`) → 서버 단기 삭제

서버에 **하루 1회** Postgres 덤프를 두고, 나중에 **Windows PC**로 받은 뒤 서버 쪽은 지우거나 짧게만 남깁니다.

## 원칙

| | 역할 |
| --- | --- |
| 서버 | 매일 dump, **기본 7일**만 보관 (장애·실수 복구용) |
| PC | 장기 보관본 → **`E:\personal-app\50_backup`** |
| 다운로드 후 | 서버 파일 삭제 가능 |

덤프에는 가족 데이터(암호문·메타 포함)가 들어 있습니다.  
BitLocker 등 암호 디스크에 두고, JWT·DB 비밀번호와 같은 곳에 두지 마세요. **git에 `.dump`를 올리지 마세요.**

서버 경로:

```text
~/personal-app/30_data/backups/prod/myfamilyhub-YYYYMMDD-HHMMSS.dump
~/personal-app/30_data/backups/dig/...
~/personal-app/30_data/backups/logs/...
```

PC 경로:

```text
E:\personal-app\50_backup\myfamilyhub-YYYYMMDD-HHMMSS.dump
```

`50_backup/` 은 README만 커밋되고 `.dump`는 gitignore됩니다.

---

## 1) 서버 준비 (최초 1회, Termius)

**OCI 서버에서** (PC에서 `fetch` 하기 전에 덤프가 있어야 합니다):

```bash
cd ~/personal-app
git fetch origin && git checkout cursor/db-daily-backup-69de
git reset --hard origin/cursor/db-daily-backup-69de

chmod +x 40_server/infra/scripts/*.sh

# 지금 한 번 만들고, 매일 03:15(Asia/Tokyo) cron 등록
bash ~/personal-app/40_server/infra/scripts/install-backup-cron.sh

bash ~/personal-app/40_server/infra/scripts/list-backups.sh
```

수동만:

```bash
bash ~/personal-app/40_server/infra/scripts/backup-db.sh prod
bash ~/personal-app/40_server/infra/scripts/list-backups.sh
```

> 서버 안에서 `fetch-backup-to-pc.sh` 를 실행하지 마세요.  
> 그건 **PC → 서버 scp** 용입니다. 서버에서 자기 IP로 SSH 하면 `Permission denied` 납니다.

---

## 2) PC에서 받기 (Windows) — 자세 절차

### 준비물

1. PC에 레포가 `E:\personal-app` 에 있음 (없으면 clone)
2. **평소 Termius/SSH로 OCI 접속할 때 쓰는 개인키**가 PC OpenSSH에 등록됨  
   - 예: `C:\Users\<이름>\.ssh\id_ed25519`  
   - 또는 `ssh-agent` / Pageant에 로드됨
3. 서버에 덤프가 이미 있음 (`list-backups.sh`에 파일 보임)

### 방법 A — PowerShell (추천)

1. **PowerShell** 또는 **Windows Terminal** 열기 (서버 Termius 아님)
2. 실행:

```powershell
cd E:\personal-app

# 최신 prod 덤프 → E:\personal-app\50_backup\
powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1
```

3. 탐색기에서 `E:\personal-app\50_backup` 에 `.dump` 생겼는지 확인
4. (선택) 서버 파일까지 바로 삭제:

```powershell
powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 -DeleteAfter
```

### 방법 B — Git Bash

Git for Windows 설치 후:

```bash
cd /e/personal-app
bash 40_server/infra/scripts/fetch-backup-to-pc.sh
# 기본 DEST = 레포의 50_backup (= E:\personal-app\50_backup)

# 받은 뒤 서버 삭제
DELETE_AFTER=1 bash 40_server/infra/scripts/fetch-backup-to-pc.sh
```

### 방법 C — scp만 (스크립트 없이)

```powershell
mkdir E:\personal-app\50_backup -Force
scp ubuntu@129.225.196.226:~/personal-app/30_data/backups/prod/myfamilyhub-*.dump E:\personal-app\50_backup\
```

그다음 서버(Termius)에서:

```bash
bash ~/personal-app/40_server/infra/scripts/list-backups.sh
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete prod/파일이름.dump
# 또는 표시된 것만
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete-downloaded
```

### Windows SSH 키 (`Permission denied (publickey)`)

이 에러는 **덤프가 없어서가 아니라**, PowerShell의 `ssh`/`scp`가 OCI에 **로그인할 키가 없을 때** 납니다.  
Termius로 서버에 들어갈 수 있어도, **Windows OpenSSH는 Termius 키를 자동으로 안 씁니다.**

1. PC에서 먼저 로그인 테스트:

```powershell
ssh ubuntu@129.225.196.226
```

2. 여기도 `Permission denied` 이면, Termius에 쓰는 **개인키 파일**을 PC에 두고 OpenSSH에 연결합니다.

   - Termius → Keychain / 해당 호스트 키 → **Export private key** (또는 이미 `90_secret` / USB에 있는 `.pem` / `id_ed25519`)
   - 예: `C:\Users\민호\.ssh\oci_ed25519` 로 저장  
   - 권한: 해당 사용자만 읽기 (다른 계정·Everyone 제거)

```powershell
# 키로 로그인되는지 확인
ssh -i $env:USERPROFILE\.ssh\oci_ed25519 -o IdentitiesOnly=yes ubuntu@129.225.196.226
```

3. 백업 받을 때 같은 키를 지정:

```powershell
cd E:\personal-app
powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1 `
  -IdentityFile $env:USERPROFILE\.ssh\oci_ed25519
```

또는 환경 변수로 기본 키 지정:

```powershell
$env:MYFAMILYHUB_SSH_KEY = "$env:USERPROFILE\.ssh\oci_ed25519"
powershell -ExecutionPolicy Bypass -File .\40_server\infra\scripts\fetch-backup-to-pc.ps1
```

Git Bash:

```bash
SSH_OPTS="-i /c/Users/민호/.ssh/oci_ed25519 -o IdentitiesOnly=yes" \
  bash 40_server/infra/scripts/fetch-backup-to-pc.sh
```

| 증상 | 의미 / 대처 |
| --- | --- |
| `Permission denied (publickey)` | PC OpenSSH 키 문제 → 위 1~3 |
| `SSH OK, but no dumps` | 로그인은 됨, 서버에 dump 없음 → Termius에서 `backup-db.sh prod` |
| 서버에서 fetch 실행 | **하지 말 것** — PC에서만 |

---

## 3) 서버에서 목록·삭제

```bash
bash ~/personal-app/40_server/infra/scripts/list-backups.sh
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --mark prod/myfamilyhub-....dump
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete prod/myfamilyhub-....dump
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete-downloaded
```

---

## 복원 (비상, 숙련자)

`pg_dump -Fc` 형식. prod를 덮어쓰기 전에 API를 멈추고, 가능하면 별도 DB에서 먼저 확인.

```bash
sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_restore -U myfamilyhub -d myfamilyhub --clean --if-exists --no-owner --no-acl /tmp/restore.dump
```

## 아직 안 하는 것

- 사진·스캔 파일 자동 tar
- 앱 UI에서 백업 다운로드

## 스크립트 요약

| 스크립트 | 어디서 | 역할 |
| --- | --- | --- |
| `backup-db.sh` | OCI | dump + 오래된 파일 삭제 |
| `install-backup-cron.sh` | OCI | cron 등록 + 스모크 dump |
| `list-backups.sh` | OCI | 목록 |
| `purge-backup.sh` | OCI | 표시·삭제 |
| `fetch-backup-to-pc.sh` | **PC (Git Bash)** | → `50_backup/` |
| `fetch-backup-to-pc.ps1` | **PC (PowerShell)** | → `E:\personal-app\50_backup\` |
