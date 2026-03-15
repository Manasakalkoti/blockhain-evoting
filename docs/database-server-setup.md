# Database Server Setup

## Requirements

- macOS with Homebrew installed
- MySQL 9.x (installed via Homebrew)

---

## Installation

If MySQL is not yet installed:

```bash
brew install mysql
```

---

## Starting the Server

Start MySQL as a background service (auto-restarts on login):

```bash
brew services start mysql
```

Check that it is running:

```bash
brew services list | grep mysql
```

Expected output: `mysql   started`

---

## First-Time Root Password Setup

After a fresh install, root has no password. Set it to match the project `.env`:

```bash
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'password'; FLUSH PRIVILEGES;"
```

---

## Creating the Project Database

```bash
mysql -u root -ppassword -e "CREATE DATABASE IF NOT EXISTS evoting CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Verify it exists:

```bash
mysql -u root -ppassword -e "SHOW DATABASES;"
```

Expected: `evoting` appears in the list.

---

## Connection Details

These match `backend/.env` and must stay in sync:

| Field    | Value                                          |
|----------|------------------------------------------------|
| Host     | localhost                                      |
| Port     | 3306                                           |
| User     | root                                           |
| Password | password                                       |
| Database | evoting                                        |
| URL      | `mysql+pymysql://root:password@localhost:3306/evoting` |

---

## Stopping the Server

```bash
brew services stop mysql
```

---

## Troubleshooting

**Can't connect — access denied:**
Root password may not be set. Run the first-time setup step above.

**Port 3306 already in use:**
Another MySQL instance may be running. Check with:
```bash
lsof -i :3306
```

**Forgot root password:**
Stop MySQL, start in safe mode, reset password:
```bash
brew services stop mysql
mysqld_safe --skip-grant-tables &
mysql -u root -e "FLUSH PRIVILEGES; ALTER USER 'root'@'localhost' IDENTIFIED BY 'password';"
brew services start mysql
```
