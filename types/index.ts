

export interface ProductSupplierRelation {
    supplier_id: string;
    supplier_material_code: string;
    suppliers?: {
        name: string;
        supplier_code: number;
    };
}

export interface Product {
    id: string;
    material_code: number;
    name: string;
    description: string;
    price: number;
    current_stock: number;
    min_stock: number;
    image_urls: string[];
    created_at: string;
    product_suppliers?: ProductSupplierRelation[];
    scheduled_price?: number;
    scheduled_date?: string;
    stars_count?: number; // Calculated field from views or joins
    user_has_starred?: boolean; // Calculated field
}

export interface Supplier {
    id: string;
    supplier_code: number;
    name: string;
    address?: string;
    city: string;
    province: string;
    country: string;
    phone_country_code: string;
    phone_area_code: string;
    phone_number: string;
    website: string;
    notes: string;
    status: 'Activo' | 'Suspendido' | 'Inactivo';
    reputation: number;
    tax_id?: string;
    gross_income_number?: string;
    tax_regime?: 'Responsable Inscripto' | 'Monotributista' | 'Proveedor del exterior' | 'Exento';
    created_at: string;
}

export interface Batch {
    id: string;
    batch_code: number;
    product_id: string; // Legacy field, kept for compatibility if needed, but logic moved to header
    supplier_id?: string;
    invoice_number?: string;
    purchase_date: string;
    category_id?: string; // Changed from category
    quantity: number; // This might be sum of items or specific if batch is per product.
    unit_cost: number;
    created_at: string;
    products?: {
        name: string;
    };
    suppliers?: {
        name: string;
    };
    purchase_categories?: { // For joining
        name: string;
    };
}

export interface Sale {
    id: string;
    sale_code: number;
    product_id: string;
    sale_date: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    invoice_number: string;
    status: 'Completada' | 'Anulada';
    payment_method: 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'QR';
    card_bank?: string;
    card_installments?: number;
    created_at: string;
    products?: {
        name: string;
        material_code: number;
    };
}

// Renamed from PurchaseItem to be more generic for carts
export interface CartItem {
    productId: string;
    productName: string;
    materialCode: number;
    quantity: number;
    unitCost?: number; // For purchases
    unitPrice?: number; // For sales
    supplierSku?: string; // For purchases
}

export interface DetectedEntity {
    type: 'supplier' | 'product' | 'adjustment' | 'other';
    name: string;
    data?: any;
    isKnown: boolean;
    matchedId?: string;
    tempId?: string;
}

export interface Coupon {
    id: string;
    created_at: string;
    campaign_name: string;
    code: string;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    valid_from: string;
    valid_until: string;
    status: 'Activo' | 'Agotado' | 'Finalizado' | 'Suspendido';
    max_uses_total?: number;
    current_uses: number;
    max_uses_per_customer?: number; // Not used in UI yet
    min_purchase_amount?: number;
    applies_to_product_id?: string;
    products?: { // Relation to product
        name: string;
        material_code: number;
    } | null;
    valid_payment_methods?: string[]; // Array of payment methods
    valid_days_of_week?: number[]; // Array of 0-6 for days of week
    qr_code_url?: string;
}

export interface Expense {
    id: string;
    expense_code: number;
    expense_date: string;
    description: string;
    amount: number;
    category_id: string; // Changed from category
    supplier_id?: string;
    invoice_number?: string;
    created_at: string;
    suppliers?: { // For joining
        name: string;
    };
    expense_categories?: { // For joining
        name: string;
    };
}

export interface PurchaseCategory {
    id: string;
    name: string;
}

export interface ExpenseCategory {
    id: string;
    name: string;
}

export interface ProductLike {
    user_id: string;
    product_id: string;
    created_at: string;
}

export interface ActiveCart {
    id: string;
    name: string;
    items: CartItem[];
    createdAt: number;
}

export interface PosDevice {
    device_id: string;
    name: string;
    status: 'pending' | 'approved' | 'blocked';
    last_active: string;
    created_at: string;
}