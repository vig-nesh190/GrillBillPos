# Ember Grill POS — Node.js + MongoDB Atlas backend

This API is the shared data layer for the Angular Ember Grill POS frontend. It uses Express and Mongoose and is ready to connect to a MongoDB Atlas Free cluster after you provide your own connection string.

## 1. Create your free MongoDB Atlas database

1. Sign in to MongoDB Atlas and create a project, then create an **M0 Free** cluster (if Atlas currently offers it for your account/region).
2. In **Database Access**, create a database user. This is separate from the Atlas website login. Grant this user access to the database you will use.
3. In **Network Access**, add your current public IP address. If the API will run on a hosting provider, allow the provider's outbound IP address(es), where available. Avoid allowing `0.0.0.0/0` except for a deliberate, temporary test because that permits connections from any IP (authentication is still required).
4. Open the cluster's **Connect** dialog, choose **Drivers / Node.js**, and copy the connection string.
5. Replace `<db_username>`, `<db_password>`, `<cluster-host>` and `<database-name>` in your own connection string. URL-encode special characters in the database password. Use a database name such as `ember_grill_pos`.

Official Atlas guidance: https://www.mongodb.com/docs/atlas/connect-to-database-deployment/ and https://www.mongodb.com/docs/atlas/driver-connection/.

## 2. Configure this API

In a terminal opened in this backend folder:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
npm install
```

**macOS / Linux**

```bash
cp .env.example .env
npm install
```

Edit `.env` and set `MONGODB_URI` to your real Atlas connection string. Keep `.env` private; it is ignored by Git and must not be committed or pasted into the frontend. Set `CLIENT_ORIGIN=http://localhost:4200` for local Angular development.

## 3. Start the API

```bash
npm run dev
```

Expected startup output includes the database name and `http://localhost:3000`. Test the health endpoint in a browser or terminal:

```text
http://localhost:3000/api/health
```

When connected, the response looks like:

```json
{ "status": "ok", "database": "ember_grill_pos", "timestamp": "..." }
```

The backend automatically inserts the 12 Ember Grill starter products and default shop settings only when the related database data has not yet been created. Existing products, invoices and settings are not reset on restart.

## API endpoints

| Method | Endpoint                | Purpose                                                   |
| ------ | ----------------------- | --------------------------------------------------------- |
| GET    | `/api/health`           | API/database health                                       |
| GET    | `/api/products`         | List menu items                                           |
| POST   | `/api/products`         | Add menu item                                             |
| PUT    | `/api/products/:id`     | Update menu item or availability                          |
| DELETE | `/api/products/:id`     | Remove menu item                                          |
| GET    | `/api/sales`            | List invoices, newest first                               |
| POST   | `/api/sales`            | Create invoice; server recalculates prices, tax and total |
| PATCH  | `/api/sales/:id/cancel` | Mark a completed demo invoice cancelled                   |
| GET    | `/api/settings`         | Read shop settings                                        |
| PUT    | `/api/settings`         | Save shop settings                                        |

## Running both projects

1. Start this backend in Terminal 1: `npm run dev`.
2. In Terminal 2, open the frontend folder and run `npm install`, then `npm start`.
3. Open `http://localhost:4200`.

The Angular dev server forwards `/api` to port 3000. The frontend shows a connection alert if the API or Atlas is unavailable.

## Troubleshooting

- **MONGODB_URI is missing:** copy `.env.example` to `.env` and add the Atlas URI.
- **IP not allowed / server selection timeout:** add the current machine's public IP in Atlas **Network Access**; a server hosted elsewhere needs its own allowed outbound IP.
- **Authentication failed:** use the Atlas **database user**, not your Atlas web-login password. Verify the username/password and URL-encode special characters in the password.
- **Frontend CORS error:** set `CLIENT_ORIGIN` to the exact URL used by the browser, including `http://` or `https://` and port if present.
- **Frontend cannot reach the backend:** start this API first and test `/api/health`.

## Important scope and security notes

- This is a demo POS backend with no login, roles or user authentication. Do not expose it publicly or use it for real customer/payment processing until you add authentication and authorization, rate limits appropriate to deployment, backups, monitoring, and operational controls.
- Checkout records Cash/UPI/Card/Other as a manual/demo selection only; no money is collected and no gateway is integrated.
- Invoice amounts are calculated on the server using product prices read from MongoDB. This does not turn the record into a tax invoice; confirm local tax/legal requirements before production.
