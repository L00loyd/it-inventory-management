const productForm = document.getElementById("productForm");
const tableBody   = document.getElementById("productTableBody");
const feedback    = document.getElementById("feedback");
const recordCount = document.getElementById("recordCount");
const formTitle   = document.getElementById("formTitle");
const submitBtn   = document.getElementById("submitBtn");
const resetBtn    = document.getElementById("resetBtn");

let editingId = null;   // product_id being edited, or null when adding a new product
let currentProducts = [];

function statusClass(status) {
    if (status === "In Stock")  return "status-in-stock";
    if (status === "Low Stock") return "status-low-stock";
    return "status-out-of-stock";
}

function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = "feedback " + type;
    feedback.hidden = false;
}

function actionButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-small " + className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function renderProducts(products) {
    currentProducts = products;
    tableBody.innerHTML = "";

    if (products.length === 0) {
        tableBody.innerHTML =
            '<tr><td colspan="10" class="empty-row">No products found.</td></tr>';
    } else {
        products.forEach(p => {
            const row = document.createElement("tr");

            // textContent keeps user-provided values safe.
            [p.product_id, p.sku, p.product_name, p.category, p.supplier,
             "RM " + Number(p.unit_price).toFixed(2), p.stock_quantity, p.reorder_level
            ].forEach(value => {
                const td = document.createElement("td");
                td.textContent = value;
                row.appendChild(td);
            });

            const statusTd = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = "status " + statusClass(p.stock_status);
            badge.textContent = p.stock_status;
            statusTd.appendChild(badge);
            row.appendChild(statusTd);

            const actionsTd = document.createElement("td");
            actionsTd.className = "actions";
            actionsTd.appendChild(actionButton("Edit", "button-secondary", () => startEdit(p.product_id)));
            actionsTd.appendChild(actionButton("Delete", "button-danger", () => deleteProduct(p)));
            row.appendChild(actionsTd);

            tableBody.appendChild(row);
        });
    }

    recordCount.textContent =
        products.length + (products.length === 1 ? " record" : " records");
}

// READ: GET /api/products
async function loadProducts() {
    try {
        const res = await fetch("/api/products");
        if (!res.ok) throw new Error("Bad response");
        renderProducts(await res.json());
    } catch (error) {
        showFeedback("Cannot reach the server.", "error");
    }
}

// Switch the form between "add" and "edit" mode.
function setEditMode(product) {
    editingId = product ? product.product_id : null;
    formTitle.textContent = product ? "Edit Product #" + product.product_id : "Add New Product";
    submitBtn.textContent = product ? "Save Changes" : "Add Product";
    resetBtn.textContent  = product ? "Cancel" : "Clear";
}

function startEdit(id) {
    const product = currentProducts.find(p => p.product_id === id);
    if (!product) return;

    productForm.reset();                    // also leaves any previous edit mode
    ["sku", "product_name", "category", "supplier",
     "unit_price", "stock_quantity", "reorder_level"
    ].forEach(name => { productForm.elements[name].value = product[name]; });

    setEditMode(product);
    feedback.hidden = true;
    productForm.scrollIntoView({ behavior: "smooth", block: "center" });
    productForm.elements.sku.focus({ preventScroll: true });
}

// CREATE (POST) or UPDATE (PUT), depending on the mode.
productForm.addEventListener("submit", async event => {
    event.preventDefault();

    const data = Object.fromEntries(new FormData(productForm).entries());
    const isEdit = editingId !== null;

    try {
        const res = await fetch(isEdit ? "/api/products/" + editingId : "/api/products", {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok) {
            const detail = Array.isArray(result.details)
                ? result.details.join(" ")
                : result.error;
            showFeedback(detail || "Request failed.", "error");
            if (res.status === 404 && isEdit) { productForm.reset(); await loadProducts(); }
            return;
        }

        productForm.reset();
        showFeedback(result.message + " " + result.product.product_name + (isEdit ? " saved." : " added."), "success");
        await loadProducts();
    } catch (error) {
        showFeedback("Cannot reach the server.", "error");
    }
});

// DELETE: DELETE /api/products/:id
async function deleteProduct(product) {
    const ok = window.confirm(
        'Delete "' + product.product_name + '" (' + product.sku + ")?\nIts stock history will be deleted too.");
    if (!ok) return;

    try {
        const res = await fetch("/api/products/" + product.product_id, { method: "DELETE" });
        const result = await res.json();

        if (!res.ok) {
            showFeedback(result.error || "Request failed.", "error");
            if (res.status === 404) await loadProducts();   // already gone: refresh the table
            return;
        }

        if (editingId === product.product_id) productForm.reset();
        showFeedback(result.message + " " + result.product.product_name + " removed.", "success");
        await loadProducts();
    } catch (error) {
        showFeedback("Cannot reach the server.", "error");
    }
}

// "Clear" / "Cancel" returns the form to add mode.
productForm.addEventListener("reset", () => {
    feedback.hidden = true;
    setEditMode(null);
});

loadProducts(); // GET /api/products when the page opens
