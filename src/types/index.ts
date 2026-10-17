// src/types/index.ts

export interface Product {
  id: string;
  name: string;
  barcode: string;
  costPrice: number;        // Puhunan per base unit (PHP)
  sellingPrice: number;     // Standard retail price per base unit (PHP)
  stockQty: number;         // Current total pieces available in inventory
  category: string;         // e.g., 'Inumin', 'Meryenda', 'Canned Goods', 'Pampalasa', 'Tingi', 'Iba pa'
  
  // Sari-Sari Tingi Support
  allowTingi: boolean;      // True if item can be sold as loose single pieces from a pack
  piecesPerPack?: number;   // e.g., 24 sachets in 1 mother pack
  tingiPrice?: number;      // Price when sold per piece (e.g. ₱13 vs ₱12/pc when bought as pack)
  
  updatedAt: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  isTingi: boolean;         // Did customer buy loose piece or whole pack?
  unitPrice: number;
  subtotal: number;
}

export interface SaleTransaction {
  id: string;
  timestamp: number;
  items: CartItem[];
  totalAmount: number;
  cashReceived: number;
  changeGiven: number;
  paymentMethod?: 'CASH' | 'GCASH';
  referenceNumber?: string;
  syncedToFirebase: boolean;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalSales: number;
  totalTransactions: number;
  estimatedProfit: number;
}