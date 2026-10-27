# OLIVA Italian Kitchen

## Start locally

From the project folder, create `.env` from the example if you do not already have one. Keep your existing `.env`; it contains local database credentials. Set `FRONTEND_PORT` to the team's assigned port.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build
```

## Admin database tool bonus

Adminer runs as a separate Compose service and is published only on `127.0.0.1`, so other machines cannot connect to the admin page. Open `http://127.0.0.1:8081` on the Docker host. Sign in with system `MySQL`, server `db`, and the database username/password from your local `.env` file. The database itself remains unpublished.

## Redis cache bonus

Redis runs as a Compose service on the private backend network. It caches `GET /api/menu` for 30 seconds. The response includes `X-Cache: MISS` when it comes from MySQL and `X-Cache: HIT` when Redis serves it. Adding/deleting a menu item, placing an order, or cancelling an order clears the menu cache so stock stays current. If Redis is unavailable, the API continues reading from MySQL.

To demonstrate the cache, call the menu endpoint twice through Nginx. Replace `8080` with the `FRONTEND_PORT` in your local `.env` (the team's assigned port is `8000 + Student 4's last two ID digits`):

```powershell
curl.exe -i http://localhost:8080/api/menu
curl.exe -i http://localhost:8080/api/menu
```

The first response should show `X-Cache: MISS`; the second should show `X-Cache: HIT`. Place an order and request the menu again to show that the updated stock is fetched and cached again.

## Cloud bonus alternative

The lab names AWS EC2. If the instructor accepts an equivalent provider, see [OCI deployment instructions](docs/OCI-DEPLOYMENT.md) for running this same Compose stack on an Oracle Cloud Always Free Ubuntu VM. Do not put `.env` or database passwords in GitHub.
