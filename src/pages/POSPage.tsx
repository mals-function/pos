// src/pages/POSPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonFooter,
  IonGrid,
  IonRow,
  IonCol,
  IonBadge,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonModal,
  IonCard,
  IonCardContent,
  useIonToast,
  useIonAlert,
} from '@ionic/react';
import {
  scanOutline,
  trashOutline,
  addOutline,
  removeOutline,
  cartOutline,
  flashOutline,
  phonePortraitOutline,
  cashOutline,
  shareSocialOutline,
  checkmarkCircleOutline,
  pricetagOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { getLocalProducts, processSale } from '../services/dbService';
import { Product, CartItem, SaleTransaction } from '../types';

const QUICK_CASH_DENOMINATIONS = [20, 50, 100, 200, 500, 1000];
const CATEGORIES = ['Lahat', 'Inumin', 'Meryenda', 'Canned Goods', 'Pampalasa', 'Tingi'];

export const POSPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Lahat');

  // Checkout & Payment State
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH'>('CASH');
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [gcashRef, setGcashRef] = useState<string>('');

  // Modals
  const [showQuickItemModal, setShowQuickItemModal] = useState(false);
  const [quickItemName, setQuickItemName] = useState('');
  const [quickItemPrice, setQuickItemPrice] = useState<number>(0);

  const [completedTx, setCompletedTx] = useState<SaleTransaction | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const [presentToast] = useIonToast();
  const [presentAlert] = useIonAlert();

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    const list = await getLocalProducts();
    setProducts(list);
  };

  // Sound / Haptic touch feedback
  const triggerHaptic = () => {
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  };

  // Filtered products for quick-add drawer / search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery);

      const matchesCategory =
        selectedCategory === 'Lahat' ||
        (selectedCategory === 'Tingi' ? p.allowTingi : p.category === selectedCategory);

      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const handleScanBarcode = async () => {
    try {
      const isSupportedResult = await BarcodeScanner.isSupported();
      if (!isSupportedResult.supported) {
        presentToast({
          message: 'Camera scanner is available on Android. Gamitin muna ang Search bar sa browser!',
          duration: 3000,
          color: 'warning',
        });
        return;
      }

      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        presentToast({ message: 'Camera permission denied', duration: 2000, color: 'danger' });
        return;
      }

      const { barcodes } = await BarcodeScanner.scan();
      if (barcodes.length > 0) {
        const scannedCode = barcodes[0]?.rawValue;
        if (scannedCode) {
          addToCartByBarcode(scannedCode);
        }
      }
    } catch (err: any) {
      presentToast({ message: `Scanner: ${err.message}`, duration: 2500, color: 'warning' });
    }
  };

  const addToCartByBarcode = (barcode: string) => {
    const matched = products.find((p) => p.barcode === barcode);
    if (!matched) {
      presentToast({
        message: `Walang produktong may barcode na "${barcode}".`,
        duration: 2500,
        color: 'danger',
      });
      return;
    }
    addProductToCart(matched);
  };

  const addProductToCart = (product: Product, forceTingi: boolean = false) => {
    if (product.stockQty <= 0) {
      presentToast({ message: `Ubos na ang stock ng ${product.name}!`, duration: 2000, color: 'warning' });
      return;
    }

    triggerHaptic();

    const isTingi = forceTingi && product.allowTingi && product.tingiPrice ? true : false;
    const price = isTingi ? product.tingiPrice! : product.sellingPrice;

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.isTingi === isTingi);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.isTingi === isTingi
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          isTingi,
          unitPrice: price,
          subtotal: price,
        },
      ];
    });

    presentToast({
      message: `+ ${product.name} (${isTingi ? 'Tingi' : 'Pack'})`,
      duration: 1200,
      color: 'success',
      position: 'top',
    });
  };

  // Add custom unbarcoded product (e.g., Yelo, Sigarilyo per stick, Bigas tingi)
  const handleAddQuickItem = () => {
    if (!quickItemName || quickItemPrice <= 0) {
      presentToast({ message: 'Ilagay ang pangalan at presyo!', duration: 2000, color: 'warning' });
      return;
    }

    const pseudoProduct: Product = {
      id: `CUSTOM-${Date.now()}`,
      name: quickItemName,
      barcode: 'MANUAL',
      costPrice: quickItemPrice * 0.8,
      sellingPrice: quickItemPrice,
      stockQty: 999,
      category: 'Iba pa',
      allowTingi: false,
      updatedAt: Date.now(),
    };

    addProductToCart(pseudoProduct);
    setQuickItemName('');
    setQuickItemPrice(0);
    setShowQuickItemModal(false);
  };

  const toggleTingiMode = (index: number) => {
    setCart((prev) => {
      const next = [...prev];
      const item = next[index];
      if (!item.product.allowTingi || !item.product.tingiPrice) return prev;

      const newIsTingi = !item.isTingi;
      const unitPrice = newIsTingi ? item.product.tingiPrice : item.product.sellingPrice;
      next[index] = {
        ...item,
        isTingi: newIsTingi,
        unitPrice,
        subtotal: item.quantity * unitPrice,
      };
      return next;
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    triggerHaptic();
    setCart((prev) => {
      const next = [...prev];
      const item = next[index];
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== index);
      }
      next[index] = { ...item, quantity: newQty, subtotal: newQty * item.unitPrice };
      return next;
    });
  };

  const totalAmount = cart.reduce((acc, curr) => acc + curr.subtotal, 0);
  const effectiveCash = paymentMethod === 'GCASH' ? totalAmount : cashTendered;
  const changeDue = Math.max(0, effectiveCash - totalAmount);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    if (paymentMethod === 'CASH' && cashTendered < totalAmount) {
      presentToast({
        message: 'Kulang ang bayad! (Insufficient cash tendered)',
        duration: 2500,
        color: 'warning',
      });
      return;
    }

    try {
      const tx = await processSale(
        cart,
        totalAmount,
        effectiveCash,
        changeDue,
        paymentMethod,
        paymentMethod === 'GCASH' ? gcashRef : undefined
      );

      setCompletedTx(tx);
      setShowReceiptModal(true);
      setCart([]);
      setCashTendered(0);
      setGcashRef('');
      loadCatalog();
    } catch (err: any) {
      presentToast({ message: `Error: ${err.message}`, duration: 2500, color: 'danger' });
    }
  };

  const handleShareReceipt = async () => {
    if (!completedTx) return;

    const receiptText = `
🏪 5M SARI-SARI STORE RESIBO
-----------------------------
Tx ID: ${completedTx.id}
Petsa: ${new Date(completedTx.timestamp).toLocaleString()}
Paraan: ${completedTx.paymentMethod || 'CASH'}${
      completedTx.referenceNumber ? ` (Ref: ${completedTx.referenceNumber})` : ''
    }
-----------------------------
${completedTx.items
  .map(
    (i) =>
      `${i.product.name} ${i.isTingi ? '(Tingi)' : ''} x${i.quantity} = ₱${i.subtotal.toFixed(2)}`
  )
  .join('\n')}
-----------------------------
KABUUAN: ₱${completedTx.totalAmount.toFixed(2)}
BAYAD: ₱${completedTx.cashReceived.toFixed(2)}
SUKLI: ₱${completedTx.changeGiven.toFixed(2)}
-----------------------------
Maraming salamat po sa pagbili sa 5M Sari-Sari Store!
`.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Resibo sa Tindahan',
          text: receiptText,
        });
      } catch (e) {
        // Ignored or dismissed
      }
    } else {
      navigator.clipboard.writeText(receiptText);
      presentToast({ message: 'Resibo nakopya sa clipboard!', duration: 2000, color: 'success' });
    }
  };

  return (
    <IonPage>
      {/* Modern Top Header */}
      <IonHeader className="ion-no-border">
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff', padding: '6px 8px' } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src="/assets/logo/icon-5m.svg"
                alt="5M Logo"
                style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'contain' }}
              />
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.05rem', letterSpacing: '-0.3px', lineHeight: 1.1, color: '#fff' }}>
                  5M Sari-Sari Store
                </div>
                <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.6px' }}>
                  POS & MABILISANG BENTA
                </div>
              </div>
            </div>

            <IonBadge color="success" style={{ padding: '6px 12px', borderRadius: '12px', fontWeight: 800, fontSize: '0.78rem' }}>
              {products.length} Paninda
            </IonBadge>
          </div>
        </IonToolbar>

        {/* Live Search & Barcode Scan Bar */}
        <div style={{ background: '#0f172a', padding: '0 12px 10px 12px' }}>
          <IonGrid className="ion-no-padding">
            <IonRow style={{ alignItems: 'center' }}>
              <IonCol size="9">
                <IonSearchbar
                  value={searchQuery}
                  placeholder="Hanapin ang paninda o barcode..."
                  onIonInput={(e) => setSearchQuery(e.detail.value || '')}
                  style={{
                    '--background': '#1e293b',
                    '--color': '#fff',
                    '--placeholder-color': '#94a3b8',
                    '--icon-color': '#38bdf8',
                    '--border-radius': '14px',
                    padding: 0,
                  } as React.CSSProperties}
                />
              </IonCol>
              <IonCol size="3" style={{ textAlign: 'right', paddingLeft: '8px' }}>
                <IonButton
                  expand="block"
                  color="success"
                  onClick={handleScanBarcode}
                  style={{
                    '--border-radius': '14px',
                    height: '44px',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <IonIcon slot="icon-only" icon={scanOutline} />
                </IonButton>
              </IonCol>
            </IonRow>
          </IonGrid>

          {/* Category Chips Scroll */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingTop: '8px',
              paddingBottom: '4px',
              scrollbarWidth: 'none',
            }}
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  border: 'none',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  background: selectedCategory === cat ? '#38bdf8' : '#1e293b',
                  color: selectedCategory === cat ? '#0f172a' : '#cbd5e1',
                  transition: 'all 0.2s ease',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </IonHeader>

      <IonContent style={{ '--background': '#f8fafc' } as React.CSSProperties}>
        {/* Quick Product Search Match Drawer (When searching) */}
        {searchQuery.trim().length > 0 && (
          <div style={{ background: '#fff', borderBottom: '2px solid #e2e8f0', padding: '10px 14px' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Mga Nakitang Paninda ({filteredProducts.length})
            </span>
            <div style={{ maxHeight: '180px', overflowY: 'auto', marginTop: '6px' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                  Walang nakitang tugma. Subukang gamitin ang "+ Mabilisang Benta".
                </div>
              ) : (
                filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      addProductToCart(p);
                      setSearchQuery('');
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#f1f5f9',
                      marginBottom: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{p.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Stock: {p.stockQty} | Puhunan: ₱{p.costPrice}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#16a34a', fontSize: '1rem' }}>
                        ₱{p.sellingPrice.toFixed(2)}
                      </div>
                      {p.allowTingi && (
                        <span style={{ fontSize: '0.7rem', color: '#0284c7' }}>
                          Tingi: ₱{p.tingiPrice}/pc
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Quick Action Ribbon */}
        <div style={{ padding: '12px 14px 4px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IonIcon icon={cartOutline} style={{ fontSize: '1.2rem', color: '#0f172a' }} />
            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>
              Kasalukuyang Cart ({cart.reduce((a, b) => a + b.quantity, 0)})
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <IonButton
              fill="outline"
              size="small"
              color="primary"
              onClick={() => setShowQuickItemModal(true)}
              style={{ '--border-radius': '10px', fontWeight: 600, fontSize: '0.78rem' }}
            >
              <IonIcon slot="start" icon={flashOutline} />
              + Quick Item
            </IonButton>

            {cart.length > 0 && (
              <IonButton
                fill="clear"
                size="small"
                color="danger"
                onClick={() => setCart([])}
              >
                <IonIcon slot="icon-only" icon={trashOutline} />
              </IonButton>
            )}
          </div>
        </div>

        {/* Modern Cart Item Cards */}
        <div style={{ padding: '0 14px 16px 14px' }}>
          {cart.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: '#fff',
                borderRadius: '16px',
                border: '1px dashed #cbd5e1',
                marginTop: '8px',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🛒</div>
              <div style={{ fontWeight: 700, color: '#334155', fontSize: '1.05rem' }}>Walang Laman ang Cart</div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
                I-scan ang barcode o pumili sa search bar para magdagdag ng bibilhin ng customer.
              </div>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={`${item.product.id}-${item.isTingi}`}
                style={{
                  background: '#fff',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  marginTop: '10px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                  border: '1px solid #f1f5f9',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a' }}>
                      {item.product.name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                      ₱{item.unitPrice.toFixed(2)} kada {item.isTingi ? 'piraso (Tingi)' : 'pack'}
                    </div>

                    {item.product.allowTingi && (
                      <button
                        onClick={() => toggleTingiMode(idx)}
                        style={{
                          marginTop: '6px',
                          border: 'none',
                          background: item.isTingi ? '#e0f2fe' : '#f1f5f9',
                          color: item.isTingi ? '#0369a1' : '#475569',
                          padding: '3px 10px',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {item.isTingi ? '✓ Naka-Tingi (Pcs)' : '⇄ Ilipat sa Tingi'}
                      </button>
                    )}
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a' }}>
                      ₱{item.subtotal.toFixed(2)}
                    </div>

                    {/* Stepper Quantity Control */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '2px 4px',
                        marginTop: '6px',
                      }}
                    >
                      <button
                        onClick={() => updateQuantity(idx, -1)}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: '#ef4444',
                          fontWeight: 900,
                          padding: '4px 8px',
                          fontSize: '1rem',
                        }}
                      >
                        -
                      </button>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', minWidth: '20px', textAlign: 'center' }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(idx, 1)}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: '#16a34a',
                          fontWeight: 900,
                          padding: '4px 8px',
                          fontSize: '1rem',
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick Cash Presets (Only when Cash mode is active) */}
        {cart.length > 0 && paymentMethod === 'CASH' && (
          <div style={{ padding: '0 14px 14px 14px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Mabilisang Bayad (Quick Cash)
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '6px' }}>
              {QUICK_CASH_DENOMINATIONS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setCashTendered(amount)}
                  style={{
                    background: cashTendered === amount ? '#0f172a' : '#fff',
                    color: cashTendered === amount ? '#fff' : '#1e293b',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '8px 4px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  ₱{amount}
                </button>
              ))}
            </div>
          </div>
        )}
      </IonContent>

      {/* Modern Checkout Footer */}
      <IonFooter
        style={{
          background: '#fff',
          borderTop: '1px solid #e2e8f0',
          padding: '12px 14px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.05)',
        }}
      >
        {/* Payment Method Segment: Cash vs GCash */}
        <IonSegment
          value={paymentMethod}
          onIonChange={(e) => setPaymentMethod(e.detail.value as any)}
          style={{ marginBottom: '10px', '--background': '#f1f5f9' } as React.CSSProperties}
        >
          <IonSegmentButton value="CASH">
            <IonLabel style={{ fontWeight: 700 }}>
              <IonIcon icon={cashOutline} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Salapi (Cash)
            </IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="GCASH">
            <IonLabel style={{ fontWeight: 700, color: '#005CE6' }}>
              <IonIcon icon={phonePortraitOutline} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              GCash / Maya
            </IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <IonGrid className="ion-no-padding">
          <IonRow style={{ alignItems: 'center' }}>
            <IonCol size="6">
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Kabuuan (Total):</span>
              <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#16a34a', letterSpacing: '-0.5px' }}>
                ₱{totalAmount.toFixed(2)}
              </div>
            </IonCol>

            <IonCol size="6">
              {paymentMethod === 'CASH' ? (
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Bayad ng Customer:</span>
                  <IonInput
                    type="number"
                    value={cashTendered || ''}
                    placeholder="₱ 0.00"
                    onIonInput={(e) => setCashTendered(parseFloat(e.detail.value || '0'))}
                    style={{
                      background: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      padding: '4px 8px',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      textAlign: 'right',
                    }}
                  />
                </div>
              ) : (
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#005CE6', fontWeight: 600 }}>GCash Ref # (Opsyonal):</span>
                  <IonInput
                    type="text"
                    value={gcashRef}
                    placeholder="e.g. 1002348"
                    onIonInput={(e) => setGcashRef(e.detail.value || '')}
                    style={{
                      background: '#eff6ff',
                      borderRadius: '10px',
                      border: '1px solid #bfdbfe',
                      padding: '4px 8px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
              )}
            </IonCol>
          </IonRow>

          <IonRow style={{ marginTop: '8px', alignItems: 'center' }}>
            <IonCol size="6">
              {paymentMethod === 'CASH' && (
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Sukli (Change):</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: changeDue > 0 ? '#ef4444' : '#64748b' }}>
                    ₱{changeDue.toFixed(2)}
                  </div>
                </div>
              )}
            </IonCol>
            <IonCol size="6">
              <IonButton
                expand="block"
                size="large"
                color={paymentMethod === 'GCASH' ? 'tertiary' : 'primary'}
                disabled={cart.length === 0 || (paymentMethod === 'CASH' && cashTendered < totalAmount)}
                onClick={handleCheckout}
                style={{
                  '--border-radius': '12px',
                  fontWeight: 800,
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.2)',
                }}
              >
                Bayad (Pay)
              </IonButton>
            </IonCol>
          </IonRow>
        </IonGrid>
      </IonFooter>

      {/* Modal: Quick Item (Unbarcoded Products) */}
      <IonModal isOpen={showQuickItemModal} onDidDismiss={() => setShowQuickItemModal(false)} initialBreakpoint={0.65}>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontWeight: 800 }}>⚡ Mabilisang Benta (Quick Item)</h2>
            <IonIcon icon={closeCircleOutline} style={{ fontSize: '1.6rem', cursor: 'pointer' }} onClick={() => setShowQuickItemModal(false)} />
          </div>
          <p style={{ color: '#64748b', fontSize: '0.88rem' }}>
            Para sa mga panindang walang barcode (e.g. Yelo, Sibuyas, Sigarilyo tingi, Kendi).
          </p>

          <div style={{ marginTop: '14px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Pangalan ng Item:</label>
            <IonInput
              value={quickItemName}
              placeholder="e.g. Yelo / Asukal tingi"
              onIonInput={(e) => setQuickItemName(e.detail.value || '')}
              style={{ background: '#f1f5f9', borderRadius: '10px', padding: '6px 10px', marginTop: '4px' }}
            />
          </div>

          <div style={{ marginTop: '14px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Presyo (₱):</label>
            <IonInput
              type="number"
              value={quickItemPrice || ''}
              placeholder="0.00"
              onIonInput={(e) => setQuickItemPrice(parseFloat(e.detail.value || '0'))}
              style={{ background: '#f1f5f9', borderRadius: '10px', padding: '6px 10px', marginTop: '4px' }}
            />
          </div>

          <IonButton expand="block" color="success" onClick={handleAddQuickItem} style={{ marginTop: '20px', '--border-radius': '10px', fontWeight: 700 }}>
            Idagdag sa Cart
          </IonButton>
        </div>
      </IonModal>

      {/* Modal: Modern Digital Receipt & Share */}
      <IonModal isOpen={showReceiptModal} onDidDismiss={() => setShowReceiptModal(false)}>
        {completedTx && (
          <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <img
                src="/assets/logo/logo-horizontal-5m.svg"
                alt="5M Sari-Sari Store"
                style={{ height: '42px', marginBottom: '10px' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <IonIcon icon={checkmarkCircleOutline} color="success" style={{ fontSize: '1.8rem' }} />
                <h2 style={{ margin: 0, fontWeight: 900, color: '#0f172a', fontSize: '1.4rem' }}>Bayad na! Salamat!</h2>
              </div>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Transaksyon ID: {completedTx.id}</span>
            </div>

            {/* Receipt Card */}
            <div
              style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '18px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b' }}>
                  <span>Paraan ng Bayad:</span>
                  <b>{completedTx.paymentMethod || 'CASH'}</b>
                </div>
                {completedTx.referenceNumber && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#0284c7' }}>
                    <span>GCash Ref #:</span>
                    <b>{completedTx.referenceNumber}</b>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                  <span>Petsa:</span>
                  <span>{new Date(completedTx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {/* Items List */}
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {completedTx.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '6px' }}>
                    <span>
                      {it.product.name} {it.isTingi ? '(Tingi)' : ''} x{it.quantity}
                    </span>
                    <span style={{ fontWeight: 700 }}>₱{it.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals Breakdown */}
              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 900, color: '#16a34a' }}>
                  <span>Kabuuan:</span>
                  <span>₱{completedTx.totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>
                  <span>Bayad:</span>
                  <span>₱{completedTx.cashReceived.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>
                  <span>Sukli:</span>
                  <span>₱{completedTx.changeGiven.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
              <IonButton expand="block" color="tertiary" onClick={handleShareReceipt} style={{ '--border-radius': '12px', fontWeight: 700 }}>
                <IonIcon slot="start" icon={shareSocialOutline} />
                I-share o Kopyahin ang Resibo
              </IonButton>

              <IonButton
                expand="block"
                color="dark"
                fill="outline"
                onClick={() => setShowReceiptModal(false)}
                style={{ marginTop: '10px', '--border-radius': '12px', fontWeight: 700 }}
              >
                Bagong Transaksyon
              </IonButton>
            </div>
          </div>
        )}
      </IonModal>
    </IonPage>
  );
};
