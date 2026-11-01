# Deploying on Linux Without Docker

For one Ubuntu 24.04 server running the API, the web app and Postgres.

The install, build, migration and start commands below were tested on Ubuntu 24.04 in production mode, along with PDFs and all 653 API tests. The systemd and nginx files have not been tested yet, so check them on the server.

## 1. Install

```bash
sudo apt-get update
sudo apt-get install -y python3-venv postgresql nginx certbot python3-certbot-nginx \
  libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0
```

Install Node 24 from nodejs.org. Ubuntu's own package is too old for Next 16.

## 2. Database

```bash
sudo -u postgres createuser --pwprompt partyparadise
sudo -u postgres createdb --owner partyparadise partyparadise
```

## 3. Application

Put the code in `/opt/partyparadise`.

```bash
cd /opt/partyparadise/api
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

Create `/opt/partyparadise/api/.env`, readable only by the app's user:

```
ENV=production
SECRET_KEY=<openssl rand -hex 32>
DATABASE_URL=postgresql://partyparadise:<password>@localhost:5432/partyparadise
WEB_URL=https://app.example.com
PORTAL_URL=https://app.example.com/portal
ALLOWED_ORIGINS=["https://app.example.com"]
INTERNAL_WEBHOOK_SECRET=<openssl rand -hex 32>
SENDGRID_API_KEY=<your key>
BUSINESS_EMAIL=<your email>
BUSINESS_PHONE=<your phone>
BUSINESS_ADDRESS=<your address>
```

```bash
venv/bin/alembic upgrade head
venv/bin/python scripts/create_admin.py
```

```bash
cd /opt/partyparadise/web
npm ci
NEXT_PUBLIC_API_URL=https://api.example.com npm run build
```

## 4. Keep it running

`/etc/systemd/system/partyparadise-api.service`:

```ini
[Unit]
Description=PartyParadise API
After=network.target postgresql.service

[Service]
User=partyparadise
WorkingDirectory=/opt/partyparadise/api
ExecStart=/opt/partyparadise/api/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/partyparadise-web.service`:

```ini
[Unit]
Description=PartyParadise web
After=network.target

[Service]
User=partyparadise
WorkingDirectory=/opt/partyparadise/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p 3000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now partyparadise-api partyparadise-web
```

## 5. HTTPS

Point both domains at the server, then add this to `/etc/nginx/sites-enabled/partyparadise`:

```nginx
server {
    server_name app.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    server_name api.example.com;
    client_max_body_size 6m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.example.com -d api.example.com
```

Login limits use the client address, so also add `--proxy-headers --forwarded-allow-ips=127.0.0.1` to the `uvicorn` command. Without it, every user looks like one address.

## 6. Backups

```bash
sudo -u postgres pg_dump partyparadise > backup.sql
```

Run this daily from cron, keep copies off the server, and test a restore.

## Updating

```bash
cd /opt/partyparadise/api && venv/bin/pip install -r requirements.txt && venv/bin/alembic upgrade head
```

```bash
cd /opt/partyparadise/web && npm ci && NEXT_PUBLIC_API_URL=https://api.example.com npm run build
```

```bash
sudo systemctl restart partyparadise-api partyparadise-web
```
