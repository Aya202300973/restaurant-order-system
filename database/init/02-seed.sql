START TRANSACTION;

INSERT INTO Customers (id, name, email) VALUES
    (1, 'Shrooq', 'shrooq@example.com'),
    (2, 'Nouran', 'nouran@example.com'),
    (3, 'Aya', 'aya@example.com'),
    (4, 'Basmala', 'basmala@example.com');

-- Remaining stock after the sample orders.
INSERT INTO MenuItems (id, title, price, stock_quantity) VALUES
    (1, 'Cheese Pizza', 12.50, 18),
    (2, 'Creamy Pasta', 14.00, 14),
    (3, 'Lasagna', 16.50, 12),
    (4, 'Mushroom Risotto', 15.00, 10),
    (5, 'Tiramisu', 7.00, 20),
    (6, 'Panna Cotta', 6.50, 0);

INSERT INTO Orders
    (id, customer_id, menu_item_id, quantity, status)
VALUES
    (1, 1, 1, 2, 'pending'),
    (2, 2, 2, 1, 'preparing');

COMMIT;
