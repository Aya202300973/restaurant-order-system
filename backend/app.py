import json
import os
from decimal import Decimal

import mysql.connector
from fastapi import FastAPI, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from mysql.connector import Error, IntegrityError
from redis import Redis
from redis.exceptions import RedisError
from pydantic import BaseModel, Field

app = FastAPI()

DB_HOST = os.environ["DB_HOST"]
DB_NAME = os.environ["DB_NAME"]
DB_USER = os.environ["DB_USER"]
DB_PASSWORD = os.environ["DB_PASSWORD"]
REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
MENU_CACHE_KEY = "oliva:menu:v1"
MENU_CACHE_TTL_SECONDS = 30
redis_client = Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


def invalidate_menu_cache():
    try:
        redis_client.delete(MENU_CACHE_KEY)
    except RedisError:
        # Redis is an optimization; database writes should still succeed without it.
        pass


def get_connection():
    return mysql.connector.connect(
        host=DB_HOST,
        port=3306,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
    )


def close_connection(connection, cursor):
    if cursor is not None:
        cursor.close()
    if connection is not None and connection.is_connected():
        connection.close()


def database_error():
    return HTTPException(status_code=503, detail="The database is temporarily unavailable.")


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)


class MenuItemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    price: Decimal = Field(ge=0)
    stock_quantity: int = Field(ge=0)


class OrderCreate(BaseModel):
    customer_id: int = Field(gt=0)
    menu_item_id: int = Field(gt=0)
    quantity: int = Field(strict=True, gt=0)


@app.get("/api/health")
def health():
    connection = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        return {"api": "running", "database": "connected"}
    except Error:
        raise database_error()
    finally:
        if connection is not None and connection.is_connected():
            connection.close()


@app.get("/api/menu")
def get_menu(response: Response):
    try:
        cached_menu = redis_client.get(MENU_CACHE_KEY)
        if cached_menu is not None:
            response.headers["X-Cache"] = "HIT"
            return json.loads(cached_menu)
    except (RedisError, json.JSONDecodeError):
        pass

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, title, price, stock_quantity FROM MenuItems ORDER BY id"
        )
        menu = cursor.fetchall()
        try:
            redis_client.setex(
                MENU_CACHE_KEY,
                MENU_CACHE_TTL_SECONDS,
                json.dumps(jsonable_encoder(menu)),
            )
        except RedisError:
            pass
        response.headers["X-Cache"] = "MISS"
        return menu
    except Error:
        raise database_error()
    finally:
        close_connection(connection, cursor)


@app.post("/api/menu", status_code=201)
def add_menu_item(item: MenuItemCreate):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO MenuItems (title, price, stock_quantity) VALUES (%s, %s, %s)",
            (item.title.strip(), item.price, item.stock_quantity),
        )
        connection.commit()
        invalidate_menu_cache()
        item_id = cursor.lastrowid
        return {
            "id": item_id,
            "title": item.title.strip(),
            "price": item.price,
            "stock_quantity": item.stock_quantity,
        }
    except Error:
        if connection is not None:
            connection.rollback()
        raise database_error()
    finally:
        close_connection(connection, cursor)


@app.delete("/api/menu/{item_id}")
def delete_menu_item(item_id: int):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("DELETE FROM MenuItems WHERE id = %s", (item_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Menu item not found.")
        connection.commit()
        invalidate_menu_cache()
        return {"message": "Menu item deleted."}
    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise
    except IntegrityError:
        if connection is not None:
            connection.rollback()
        raise HTTPException(
            status_code=409,
            detail="This menu item cannot be deleted because an order refers to it.",
        )
    except Error:
        if connection is not None:
            connection.rollback()
        raise database_error()
    finally:
        close_connection(connection, cursor)


@app.get("/api/customers")
def get_customers():
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id, name, email FROM Customers ORDER BY id")
        return cursor.fetchall()
    except Error:
        raise database_error()
    finally:
        close_connection(connection, cursor)


@app.post("/api/customers", status_code=201)
def add_customer(customer: CustomerCreate):
    name = customer.name.strip()
    email = customer.email.strip()
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required.")

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO Customers (name, email) VALUES (%s, %s)",
            (name, email),
        )
        connection.commit()
        return {"id": cursor.lastrowid, "name": name, "email": email}
    except IntegrityError as error:
        if connection is not None:
            connection.rollback()
        if error.errno == 1062:
            raise HTTPException(status_code=409, detail="This email is already registered.")
        raise database_error()
    except Error:
        if connection is not None:
            connection.rollback()
        raise database_error()
    finally:
        close_connection(connection, cursor)


@app.get("/api/orders")
def get_orders():
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, customer_id, menu_item_id, quantity, status "
            "FROM Orders ORDER BY id DESC"
        )
        return cursor.fetchall()
    except Error:
        raise database_error()
    finally:
        close_connection(connection, cursor)


@app.post("/api/orders", status_code=201)
def place_order(order: OrderCreate):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()

        cursor.execute("SELECT id FROM Customers WHERE id = %s", (order.customer_id,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Customer not found.")

        cursor.execute(
            "SELECT stock_quantity FROM MenuItems WHERE id = %s FOR UPDATE",
            (order.menu_item_id,),
        )
        menu_item = cursor.fetchone()
        if menu_item is None:
            raise HTTPException(status_code=404, detail="Menu item not found.")
        if menu_item["stock_quantity"] < order.quantity:
            raise HTTPException(status_code=409, detail="Not enough stock is available.")

        cursor.execute(
            "UPDATE MenuItems SET stock_quantity = stock_quantity - %s "
            "WHERE id = %s AND stock_quantity >= %s",
            (order.quantity, order.menu_item_id, order.quantity),
        )
        if cursor.rowcount != 1:
            raise HTTPException(status_code=409, detail="Not enough stock is available.")

        cursor.execute(
            "INSERT INTO Orders (customer_id, menu_item_id, quantity, status) "
            "VALUES (%s, %s, %s, 'pending')",
            (order.customer_id, order.menu_item_id, order.quantity),
        )
        order_id = cursor.lastrowid
        connection.commit()
        invalidate_menu_cache()
        return {"id": order_id, "status": "pending"}
    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise
    except IntegrityError as error:
        if connection is not None:
            connection.rollback()
        if error.errno == 1452:
            raise HTTPException(status_code=404, detail="Customer or menu item not found.")
        raise database_error()
    except Error:
        if connection is not None:
            connection.rollback()
        raise database_error()
    finally:
        close_connection(connection, cursor)


@app.delete("/api/orders/{order_id}")
def cancel_order(order_id: int):
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()
        cursor.execute(
            "SELECT id, menu_item_id, quantity, status "
            "FROM Orders WHERE id = %s FOR UPDATE",
            (order_id,),
        )
        order = cursor.fetchone()
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found.")
        if order["status"] == "cancelled":
            connection.commit()
            return {"id": order_id, "status": "cancelled", "message": "Order was already cancelled."}
        if order["status"] == "completed":
            raise HTTPException(status_code=409, detail="A completed order cannot be cancelled.")
        if order["status"] not in ("pending", "preparing", "ready"):
            raise HTTPException(status_code=409, detail="This order cannot be cancelled.")

        cursor.execute(
            "UPDATE MenuItems SET stock_quantity = stock_quantity + %s WHERE id = %s",
            (order["quantity"], order["menu_item_id"]),
        )
        if cursor.rowcount != 1:
            raise HTTPException(status_code=409, detail="The ordered menu item no longer exists.")
        cursor.execute(
            "UPDATE Orders SET status = 'cancelled' WHERE id = %s",
            (order_id,),
        )
        connection.commit()
        invalidate_menu_cache()
        return {"id": order_id, "status": "cancelled", "message": "Order cancelled and stock restored."}
    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise
    except Error:
        if connection is not None:
            connection.rollback()
        raise database_error()
    finally:
        close_connection(connection, cursor)
