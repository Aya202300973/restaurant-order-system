-- Customers who place orders.
CREATE TABLE Customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    CONSTRAINT uq_customers_email UNIQUE (email)
) ENGINE=InnoDB;

-- Italian dishes available in the restaurant.
CREATE TABLE MenuItems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    CONSTRAINT chk_menu_price CHECK (price >= 0),
    CONSTRAINT chk_menu_stock CHECK (stock_quantity >= 0)
) ENGINE=InnoDB;

-- Each order refers to one customer and one menu item.
CREATE TABLE Orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    menu_item_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id)
        REFERENCES Customers(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_orders_menu_item
        FOREIGN KEY (menu_item_id)
        REFERENCES MenuItems(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_order_quantity CHECK (quantity > 0),

    CONSTRAINT chk_order_status CHECK (
        status IN (
            'pending',
            'preparing',
            'ready',
            'completed',
            'cancelled'
        )
    )
) ENGINE=InnoDB;
