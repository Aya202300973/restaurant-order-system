# OLIVA frontend

Plain HTML, CSS, and JavaScript served by Nginx. The menu page is the customer experience, with a single-item order drawer and order-status history; `manage.html` is the separate classroom menu-management demo.

## Preview without a backend

Start Docker Desktop, then from this directory run:

```bash
docker build -t oliva-frontend:local .
docker run --rm -p 127.0.0.1:8080:80 oliva-frontend:local
```

Open `http://localhost:8080/?demo=1` for temporary preview data. The page shows a preview banner and the mock API uses tab-scoped session storage. No requests are sent to the backend. Open `http://localhost:8080/manage.html?demo=1` for the management preview. Both pages share preview menu changes in that browser tab.

Stop the temporary server with Ctrl+C. Port 8080 is only for this standalone preview; the group selects the assignment port in Compose.

## Integrated Compose project

Once the root Compose file is ready, run `docker compose up --build` from the repository root and open the URL using the group's assigned host port. Leave off `?demo=1` for real API mode. The backend must listen on container port 5000 and bind to `0.0.0.0`. Nginx uses the Compose service name `backend`.

## API contract

The frontend uses only the agreed routes:

- `GET /api/menu`, `POST /api/menu`, `DELETE /api/menu/{id}`
- `GET /api/customers`, `POST /api/customers`
- `GET /api/orders`, `POST /api/orders`, and `DELETE /api/orders/{id}`

The basket stores one item type and a quantity. Selecting a different dish replaces the previous selection and tells the customer. Checkout submits `customer_id`, `menu_item_id`, and `quantity`. The order-status list reads `id`, `customer_id`, `menu_item_id`, `quantity`, and `status`; cancellation changes an eligible order to `cancelled` and restores its stock once. Valid statuses are `pending`, `preparing`, `ready`, `completed`, and `cancelled`. Item data uses `id`, `title`, `price`, and `stock_quantity`.

The management page has no sign-in. It is an academic demonstration feature, not a secured admin panel. Small cartoon illustrations are local presentation assets selected by matching the title; no image or category fields are sent to the API.

## Files

- `index.html`, `style.css`, `script.js`: customer menu, single-item order drawer, and checkout.
- `manage.html`, `manage.js`: separate classroom menu-management page.
- `api.js`: shared real API client and temporary preview adapter.
- `assets/dish-*.svg`: hand-drawn cartoon food illustrations.
- `assets/food-fallback.svg`: local fallback when a title has no matching photo or a photo cannot load.
- `nginx.conf`: serves both pages and proxies `/api/` to `http://backend:5000` without dropping the prefix.
- `Dockerfile`: packages the pages, scripts, and required assets into Nginx.
