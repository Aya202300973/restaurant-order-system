import os
import time
import mysql.connector
from mysql.connector import Error
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

# Connection settings come from environment variables
DB_HOST = os.environ.get("DB_HOST", "db")
DB_NAME = os.environ.get("MYSQL_DATABASE", "restaurant_db")
DB_USER = os.environ.get("MYSQL_USER", "admin")
DB_PASSWORD = os.environ.get("MYSQL_PASSWORD", "secret")

def get_connection():
    return mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

def initialize_database():
    """Create the tables. Retry, because MySQL may still be starting."""
    for attempt in range(30):
        try:
            connection = get_connection()
            cursor = connection.cursor()
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS Customers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS MenuItems (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    price DECIMAL(10, 2) NOT NULL,
                    stock_quantity INT NOT NULL
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS Orders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    customer_id INT NOT NULL,
                    menu_item_id INT NOT NULL,
                    quantity INT NOT NULL,
                    status VARCHAR(50) DEFAULT 'Pending',
                    FOREIGN KEY (customer_id) REFERENCES Customers(id),
                    FOREIGN KEY (menu_item_id) REFERENCES MenuItems(id)
                )
            """)
            
            connection.commit()
            cursor.close()
            connection.close()
            print("Database initialized successfully.", flush=True)
            return
        except Error as error:
            print(f"Database not ready ({attempt + 1}/30): {error}", flush=True)
            time.sleep(2)
            
    raise RuntimeError("Could not connect to the database.")

# Pydantic models for JSON request validation
class CustomerCreate(BaseModel):
    name: str
    email: str

class MenuItemCreate(BaseModel):
    title: str
    price: float
    stock_quantity: int

class OrderCreate(BaseModel):
    customer_id: int
    menu_item_id: int
    quantity: int

@app.on_event("startup")
def startup_event():
    initialize_database()

@app.get("/api/health")
def health():
    try:
        get_connection().close()
        return {"api": "running", "database": "connected"}
    except Error:
        raise HTTPException(status_code=503, detail="Database unavailable")

@app.get("/api/menu")
def get_menu():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT id, title, price, stock_quantity FROM MenuItems")
    items = cursor.fetchall()
    cursor.close()
    connection.close()
    return items

@app.post("/api/menu", status_code=201)
def add_menu_item(item: MenuItemCreate):
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute("INSERT INTO MenuItems (title, price, stock_quantity) VALUES (%s, %s, %s)",
                   (item.title, item.price, item.stock_quantity))
    connection.commit()
    item_id = cursor.lastrowid
    cursor.close()
    connection.close()
    return {"id": item_id, "title": item.title}

@app.delete("/api/menu/{item_id}")
def delete_menu_item(item_id: int):
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM MenuItems WHERE id=%s", (item_id,))
    connection.commit()
    deleted = cursor.rowcount
    cursor.close()
    connection.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return {"message": "Menu item deleted"}

@app.get("/api/customers")
def get_customers():
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT id, name, email FROM Customers")
    customers = cursor.fetchall()
    cursor.close()
    connection.close()
    return customers

@app.post("/api/customers", status_code=201)
def add_customer(customer: CustomerCreate):
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("INSERT INTO Customers (name, email) VALUES (%s, %s)", 
                       (customer.name, customer.email))
        connection.commit()
        customer_id = cursor.lastrowid
        cursor.close()
        connection.close()
        return {"id": customer_id, "name": customer.name}
    except Error as e:
        if "Duplicate entry" in str(e):
            raise HTTPException(status_code=400, detail="Email already exists")
        raise HTTPException(status_code=500, detail="Database error")

@app.post("/api/orders", status_code=201)
def place_order(order: OrderCreate):
    if order.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")
    
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    
    # Business Rule: Check available stock
    cursor.execute("SELECT stock_quantity FROM MenuItems WHERE id=%s", (order.menu_item_id,))
    menu_item = cursor.fetchone()
    
    if not menu_item:
        cursor.close()
        connection.close()
        raise HTTPException(status_code=404, detail="Menu item not found")
        
    if menu_item["stock_quantity"] < order.quantity:
        cursor.close()
        connection.close()
        raise HTTPException(status_code=400, detail="Not enough stock available")
        
    # Deduct stock and create the order transactionally
    cursor.execute("UPDATE MenuItems SET stock_quantity = stock_quantity - %s WHERE id=%s", 
                   (order.quantity, order.menu_item_id))
    
    cursor.execute("INSERT INTO Orders (customer_id, menu_item_id, quantity) VALUES (%s, %s, %s)",
                   (order.customer_id, order.menu_item_id, order.quantity))
    
    connection.commit()
    order_id = cursor.lastrowid
    cursor.close()
    connection.close()
    return {"id": order_id, "status": "Order placed successfully"}

@app.delete("/api/orders/{order_id}")
def cancel_order(order_id: int):
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute("DELETE FROM Orders WHERE id=%s", (order_id,))
    connection.commit()
    deleted = cursor.rowcount
    cursor.close()
    connection.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"message": "Order canceled"}
