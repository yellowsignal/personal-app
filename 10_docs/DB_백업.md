# DB 일일 백업 → PC 다운로드 → 서버 단기 삭제

서버에 **하루 1회** Postgres 덤프를 두고, 나중에 PC로 받은 뒤 서버 쪽은 지우거나 짧게만 남깁니다.

## 원칙

| | 역할 |
| --- | --- |
| 서버 | 매일 dump, **기본 7일**만 보관 (장애·실수 복구용) |
| PC | 장기 보관본 (오프사이트) |
| 다운로드 후 | 서버 파일 삭제 가능 (`purge-backup.sh` / `DELETE_AFTER=1`) |

덤프에는 가족 데이터(암호문·메타 포함)가 들어 있습니다.  
로컬은 암호화 디스크/암호 폴더에 두고, JWT·DB 비밀번호와 같은 곳에 두지 마세요. **git에 올리지 마세요.**

경로(서버):

```text
~/personal-app/30_data/backups/prod/myfamilyhub-YYYYMMDD-HHMMSS.dump
~/personal-app/30_data/backups/dig/...
~/personal-app/30_data/backups/logs/{prod,dig}.log
```

`30_data/backups/` 는 `.gitignore` 대상입니다.

## 최초 1회 (OCI / Termius)

```bash
cd ~/personal-app
git pull   # 또는 해당 브랜치 checkout 후
chmod +x 40_server/infra/scripts/backup-db.sh \
         40_server/infra/scripts/install-backup-cron.sh \
         40_server/infra/scripts/list-backups.sh \
         40_server/infra/scripts/purge-backup.sh \
         40_server/infra/scripts/fetch-backup-to-pc.sh

# 지금 한 번 만들고 cron 등록 (기본: 매일 03:15 Asia/Tokyo, prod)
bash ~/personal-app/40_server/infra/scripts/install-backup-cron.sh

# dig도 같이 받으려면:
# INCLUDE_DIG=1 bash ~/personal-app/40_server/infra/scripts/install-backup-cron.sh
```

수동 백업만:

```bash
bash ~/personal-app/40_server/infra/scripts/backup-db.sh prod
bash ~/personal-app/40_server/infra/scripts/list-backups.sh
```

보관 일수 변경: `RETENTION_DAYS=14 bash .../backup-db.sh prod`  
cron 시각 변경: `CRON_SCHEDULE="0 4 * * *" bash .../install-backup-cron.sh`

## PC에서 받기

PC에 SSH 키가 있을 때:

```bash
# 레포를 clone 해 두었거나, 스크립트만 복사해도 됨
HOST=ubuntu@129.225.196.226 \
DEST=~/Backups/myfamilyhub \
bash 40_server/infra/scripts/fetch-backup-to-pc.sh
```

받은 뒤 **서버 파일까지 바로 삭제**:

```bash
DELETE_AFTER=1 HOST=ubuntu@129.225.196.226 bash 40_server/infra/scripts/fetch-backup-to-pc.sh
```

또는 scp만 직접:

```bash
scp ubuntu@129.225.196.226:~/personal-app/30_data/backups/prod/myfamilyhub-*.dump ~/Backups/myfamilyhub/
```

서버에서 표시·삭제:

```bash
bash ~/personal-app/40_server/infra/scripts/list-backups.sh
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --mark prod/myfamilyhub-20260904-031500.dump
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete prod/myfamilyhub-20260904-031500.dump
# 또는 표시된 것만 일괄 삭제
bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete-downloaded
```

## 복원 (비상 시)

덤프는 `pg_dump -Fc` 형식입니다. **실수로 덮어쓰지 않도록** 복원 전 prod API를 멈추고, 필요하면 별도 DB/컨테이너에 먼저 올려 확인하세요.

대략적인 흐름(숙련자용):

```bash
# 예: 컨테이너로 dump 복사 후
sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_restore -U myfamilyhub -d myfamilyhub --clean --if-exists --no-owner --no-acl /tmp/restore.dump
```

일상 복원 절차를 자주 쓸 일은 없습니다. 필요하면 그때 전용 스크립트를 추가합니다.

## 아직 안 하는 것

- 사진·스캔 파일(`30_data/photos` 등) 자동 tar — DB와 별도로 필요하면 이후 추가
- 앱 UI에서 백업 다운로드 — 관리자 스크립트만 (아이폰보다는 PC)

## 스크립트 요약

| 스크립트 | 어디서 | 역할 |
| --- | --- | --- |
| `backup-db.sh` | OCI | dump + 오래된 파일 삭제 |
| `install-backup-cron.sh` | OCI | cron 등록 + 스모크 dump |
| `list-backups.sh` | OCI | 목록 / downloaded 표시 |
| `purge-backup.sh` | OCI | 표시·삭제 |
| `fetch-backup-to-pc.sh` | PC | scp + (옵션) 서버 삭제 |
