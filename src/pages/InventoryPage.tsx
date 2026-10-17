// src/pages/InventoryPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBadge,
  IonFab,
  IonFabButton,
  IonIcon,
  IonModal,
  IonButton,
  IonInput,
  IonToggle,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonGrid,
  IonRow,
  IonCol,
  useIonToast,
  useIonAlert,
} from '@ionic/react';
import {
  addOutline,
  barcodeOutline,
  createOutline,
  trashOutline,
  cubeOutline,
  trendingUpOutline,
  closeCircleOutline,
  scanOutline,
} from 'ionicons/icons';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import {
  getLocalProducts,
  saveProductLocalAndSync,
  quickUpdateStockLocalAndSync,
  deleteProductLocalAndSync,
} from '../services/dbService';
import { Product } from '../types';

const CATEGORIES = ['Lahat', 'Inumin', 'Meryenda', 'Canned Goods', 'Pampalasa', 'Tingi', 'Iba pa'];

export const InventoryPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Lahat');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Quick Restock State
  const [quickRestockProduct, setQuickRestockProduct] = useState<Product | null>(null);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockQty, setRestockQty] = useState<number>(12);

  // Form Fields
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('Inumin');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [stockQty, setStockQty] = useState<number>(0);
  const [allowTingi, setAllowTingi] = useState(false);
  const [piecesPerPack, setPiecesPerPack] = useState<number>(12);
  const [tingiPrice, setTingiPrice] = useState<number>(0);

  const [presentToast] = useIonToast();
  const [presentAlert] = useIonAlert();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const data = await getLocalProducts();
    setProducts(data);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery);

      const matchesCategory =
        selectedCategory === 'Lahat' ||
        (selectedCategory === 'Tingi' ? p.allowTingi : p.category === selectedCategory);

      const matchesLowStock = filterLowStockOnly ? p.stockQty <= 5 : true;

      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [products, searchQuery, selectedCategory, filterLowStockOnly]);

  // Inventory value & count calculations
  const inventoryStats = useMemo(() => {
    let totalStock = 0;
    let totalCost = 0;
    let totalPotentialSales = 0;
    let lowStockCount = 0;

    products.forEach((p) => {
      totalStock += p.stockQty;
      totalCost += p.costPrice * p.stockQty;
      totalPotentialSales += p.sellingPrice * p.stockQty;
      if (p.stockQty <= 5) lowStockCount++;
    });

    return {
      totalStock,
      totalCost,
      totalPotentialSales,
      expectedProfit: Math.max(0, totalPotentialSales - totalCost),
      lowStockCount,
    };
  }, [products]);

  const handleScanForBarcode = async () => {
    try {
      const isSupportedResult = await BarcodeScanner.isSupported();
      if (!isSupportedResult.supported) {
        presentToast({
          message: 'Scanner works on physical Android device. I-type ang barcode sa text box.',
          duration: 3000,
          color: 'warning',
        });
        return;
      }

      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera === 'granted' || camera === 'limited') {
        const { barcodes } = await BarcodeScanner.scan();
        const scannedBarcode = barcodes[0]?.rawValue;
        if (scannedBarcode) {
          setBarcode(scannedBarcode);
        }
      }
    } catch (err: any) {
      presentToast({ message: `Scan error: ${err.message}`, duration: 2000 });
    }
  };

  // Quick Barcode Scanning for Search Bar
  const handleScanSearchBarcode = async () => {
    try {
      const isSupportedResult = await BarcodeScanner.isSupported();
      if (!isSupportedResult.supported) {
        presentToast({
          message: 'Available sa Android device ang camera scanner. I-type ang barcode sa search bar!',
          duration: 3000,
          color: 'warning',
        });
        return;
      }

      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        presentToast({ message: 'Kailangan ng camera permission para mag-scan.', duration: 2500, color: 'danger' });
        return;
      }

      const { barcodes } = await BarcodeScanner.scan();
      const scannedCode = barcodes[0]?.rawValue;
      if (scannedCode) {
        setSearchQuery(scannedCode);
        const match = products.find((p) => p.barcode === scannedCode);
        if (match) {
          presentToast({
            message: `Nahanap ang paninda: ${match.name}!`,
            duration: 2000,
            color: 'success',
            position: 'top',
          });
        } else {
          presentAlert({
            header: 'Bagong Barcode',
            message: `Walang nahanap na panindang may barcode na "${scannedCode}". Nais mo ba itong idagdag sa imbentaryo ngayon?`,
            buttons: [
              { text: 'Huwag Muna', role: 'cancel' },
              {
                text: 'Magdagdag (+)',
                handler: () => {
                  setEditingProduct(null);
                  resetForm();
                  setBarcode(scannedCode);
                  setShowModal(true);
                },
              },
            ],
          });
        }
      }
    } catch (err: any) {
      presentToast({ message: `Scan error: ${err.message}`, duration: 2500, color: 'warning' });
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setBarcode(p.barcode);
    setCategory(p.category || 'Inumin');
    setCostPrice(p.costPrice);
    setSellingPrice(p.sellingPrice);
    setStockQty(p.stockQty);
    setAllowTingi(p.allowTingi);
    setPiecesPerPack(p.piecesPerPack || 12);
    setTingiPrice(p.tingiPrice || 0);
    setShowModal(true);
  };

  const handleSaveProduct = async () => {
    if (!name.trim() || !barcode.trim()) {
      presentToast({ message: 'Pangalan at Barcode ay kailangan!', duration: 2000, color: 'warning' });
      return;
    }

    const updatedProduct: Product = {
      id: editingProduct ? editingProduct.id : `PROD-${barcode.trim()}`,
      name: name.trim(),
      barcode: barcode.trim(),
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      stockQty: Number(stockQty) || 0,
      category,
      allowTingi,
      piecesPerPack: allowTingi ? Number(piecesPerPack) : undefined,
      tingiPrice: allowTingi ? Number(tingiPrice) : undefined,
      updatedAt: Date.now(),
    };

    await saveProductLocalAndSync(updatedProduct);
    setShowModal(false);
    resetForm();
    loadProducts();
    presentToast({ message: 'Nai-save ang produkto!', duration: 2000, color: 'success' });
  };

  const handleDeleteProduct = (p: Product) => {
    presentAlert({
      header: 'Kumpirmahin ang Pagbura',
      message: `Sigurado ka bang nais mong tanggalin ang "${p.name}" sa imbentaryo?`,
      buttons: [
        { text: 'Kanselahin', role: 'cancel' },
        {
          text: 'Tanggalin',
          role: 'destructive',
          handler: async () => {
            await deleteProductLocalAndSync(p.id);
            loadProducts();
            presentToast({ message: `Nabura ang ${p.name}`, duration: 2000, color: 'danger' });
          },
        },
      ],
    });
  };

  const handleQuickRestock = async () => {
    if (!quickRestockProduct) return;
    await quickUpdateStockLocalAndSync(quickRestockProduct.id, restockQty);
    setShowRestockModal(false);
    loadProducts();
    presentToast({
      message: `Nagdagdag ng +${restockQty} pcs sa ${quickRestockProduct.name}!`,
      duration: 2000,
      color: 'success',
    });
  };

  const resetForm = () => {
    setName('');
    setBarcode('');
    setCategory('Inumin');
    setCostPrice(0);
    setSellingPrice(0);
    setStockQty(0);
    setAllowTingi(false);
    setPiecesPerPack(12);
    setTingiPrice(0);
  };

  return (
    <IonPage>
      {/* Modern Header */}
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
                  IMBENTARYO AT STOCK
                </div>
              </div>
            </div>

            <IonBadge color="primary" style={{ padding: '6px 12px', borderRadius: '12px', fontWeight: 800, fontSize: '0.78rem' }}>
              {products.length} Uri
            </IonBadge>
          </div>
        </IonToolbar>

        {/* Search & Barcode Scan Bar */}
        <div style={{ background: '#0f172a', padding: '0 12px 10px 12px' }}>
          <IonGrid className="ion-no-padding">
            <IonRow style={{ alignItems: 'center' }}>
              <IonCol size="9">
                <IonSearchbar
                  value={searchQuery}
                  placeholder="Pangalan o barcode..."
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
                  onClick={handleScanSearchBarcode}
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

          {/* Active Search Query Clear Tag */}
          {searchQuery.trim().length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600 }}>
                Naka-filter sa: "<b>{searchQuery}</b>"
              </span>
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: '#334155',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                I-clear ✕
              </button>
            </div>
          )}

          {/* Category Chips and Low Stock Filter */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingTop: '10px',
              scrollbarWidth: 'none',
              alignItems: 'center',
            }}
          >
            <button
              onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
              style={{
                border: 'none',
                borderRadius: '20px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: filterLowStockOnly ? '#ef4444' : '#334155',
                color: '#fff',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ⚠️ Mababang Stock {inventoryStats.lowStockCount > 0 && `(${inventoryStats.lowStockCount})`}
            </button>

            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  border: 'none',
                  borderRadius: '20px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  background: selectedCategory === cat ? '#38bdf8' : '#1e293b',
                  color: selectedCategory === cat ? '#0f172a' : '#cbd5e1',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </IonHeader>

      <IonContent style={{ '--background': '#f8fafc' } as React.CSSProperties}>
        <div style={{ padding: '10px 14px 80px 14px' }}>
          {/* Quick Inventory Valuation Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: '16px',
              padding: '14px 16px',
              marginBottom: '14px',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(15,23,42,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Halaga ng Imbentaryo (Asset Worth)
              </span>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
                {inventoryStats.totalStock} kabuuang piraso
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>Kabuuang Puhunan</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc' }}>
                  ₱{inventoryStats.totalCost.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#86efac' }}>Tantyang Benta</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#4ade80' }}>
                  ₱{inventoryStats.totalPotentialSales.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Mga Nakalistang Paninda ({filteredProducts.length})
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: '#fff',
                borderRadius: '16px',
                border: '1px dashed #cbd5e1',
                marginTop: '10px',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📦</div>
              <div style={{ fontWeight: 700, color: '#334155' }}>Walang Nahanap na Paninda</div>
              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
                Pindutin ang bilog na (+) button sa ibaba para magrehistro ng bagong produkto.
              </div>
            </div>
          ) : (
            filteredProducts.map((prod) => {
              const profitMargin = prod.sellingPrice - prod.costPrice;
              const profitPercent = prod.costPrice > 0 ? (profitMargin / prod.costPrice) * 100 : 0;

              return (
                <div
                  key={prod.id}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    padding: '14px',
                    marginBottom: '10px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{prod.name}</span>
                        <IonBadge color="light" style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                          {prod.category}
                        </IonBadge>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '3px' }}>
                        Barcode: <code style={{ color: '#334155' }}>{prod.barcode}</code>
                      </div>

                      {/* Pricing & Profit Matrix */}
                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px', fontSize: '0.82rem', flexWrap: 'wrap' }}>
                        <span>
                          Puhunan: <b>₱{prod.costPrice.toFixed(2)}</b>
                        </span>
                        <span>
                          Benta: <b style={{ color: '#16a34a' }}>₱{prod.sellingPrice.toFixed(2)}</b>
                        </span>
                        <span style={{ color: '#0284c7', fontWeight: 700 }}>
                          Tubo: +₱{profitMargin.toFixed(2)} ({profitPercent.toFixed(0)}%)
                        </span>
                      </div>

                      {prod.allowTingi && (
                        <div style={{ fontSize: '0.75rem', color: '#7c3aed', marginTop: '4px', fontWeight: 600 }}>
                          ✦ Tingi: ₱{prod.tingiPrice}/pc ({prod.piecesPerPack} pcs/pack)
                        </div>
                      )}
                    </div>

                    {/* Stock Status Badge */}
                    <div style={{ textAlign: 'right' }}>
                      <IonBadge
                        color={prod.stockQty === 0 ? 'danger' : prod.stockQty <= 5 ? 'warning' : 'success'}
                        style={{ padding: '6px 10px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800 }}
                      >
                        {prod.stockQty} pcs
                      </IonBadge>
                    </div>
                  </div>

                  {/* Quick Action Bar for Item */}
                  <div
                    style={{
                      borderTop: '1px solid #f8fafc',
                      paddingTop: '8px',
                      marginTop: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      onClick={() => {
                        setQuickRestockProduct(prod);
                        setShowRestockModal(true);
                      }}
                      style={{
                        border: '1px solid #bfdbfe',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Magdagdag ng Stock
                    </button>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <IonButton fill="clear" size="small" color="medium" onClick={() => openEditModal(prod)}>
                        <IonIcon slot="icon-only" icon={createOutline} />
                      </IonButton>
                      <IonButton fill="clear" size="small" color="danger" onClick={() => handleDeleteProduct(prod)}>
                        <IonIcon slot="icon-only" icon={trashOutline} />
                      </IonButton>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Add Product Button */}
        <IonFab vertical="bottom" horizontal="end" slot="fixed" style={{ marginBottom: '16px', marginRight: '10px' }}>
          <IonFabButton onClick={openAddModal} color="primary" style={{ boxShadow: '0 4px 14px rgba(15,23,42,0.3)' }}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

        {/* Modal: Quick Restock (+ Stock) */}
        <IonModal isOpen={showRestockModal} onDidDismiss={() => setShowRestockModal(false)} initialBreakpoint={0.5}>
          {quickRestockProduct && (
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontWeight: 800 }}>📦 Magdagdag ng Stock (Restock)</h2>
                <IonIcon icon={closeCircleOutline} style={{ fontSize: '1.6rem', cursor: 'pointer' }} onClick={() => setShowRestockModal(false)} />
              </div>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                Para sa: <b>{quickRestockProduct.name}</b> (Kasalukuyang Stock: {quickRestockProduct.stockQty} pcs)
              </p>

              <div style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Ilang piraso ang idadagdag?</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', margin: '8px 0' }}>
                  {[6, 12, 24, 48].map((q) => (
                    <button
                      key={q}
                      onClick={() => setRestockQty(q)}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '8px',
                        border: restockQty === q ? '2px solid #0f172a' : '1px solid #cbd5e1',
                        background: restockQty === q ? '#0f172a' : '#f8fafc',
                        color: restockQty === q ? '#fff' : '#1e293b',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      +{q}
                    </button>
                  ))}
                </div>

                <IonInput
                  type="number"
                  value={restockQty}
                  onIonInput={(e) => setRestockQty(parseInt(e.detail.value || '0'))}
                  style={{ background: '#f1f5f9', borderRadius: '10px', padding: '6px 10px', marginTop: '8px', fontWeight: 800 }}
                />
              </div>

              <IonButton expand="block" color="success" onClick={handleQuickRestock} style={{ marginTop: '20px', '--border-radius': '10px', fontWeight: 700 }}>
                Kumpirmahin ang Bagong Stock
              </IonButton>
            </div>
          )}
        </IonModal>

        {/* Modal: Full Add / Edit Product */}
        <IonModal isOpen={showModal} onDidDismiss={() => setShowModal(false)}>
          <IonHeader>
            <IonToolbar color="primary">
              <IonTitle>{editingProduct ? 'I-edit ang Paninda' : 'Magdagdag ng Paninda'}</IonTitle>
            </IonToolbar>
          </IonHeader>

          <IonContent className="ion-padding" style={{ ['--background' as string]: '#f8fafc' }}>
            <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Pangalan ng Produkto:</label>
                <IonInput
                  value={name}
                  placeholder="e.g. Lucky Me Pancit Canton Kalamansi"
                  onIonInput={(e) => setName(e.detail.value || '')}
                  style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', marginTop: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Barcode Number:</label>
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <IonInput
                    value={barcode}
                    placeholder="I-type o i-scan ang barcode"
                    onIonInput={(e) => setBarcode(e.detail.value || '')}
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px' }}
                  />
                  <IonButton fill="outline" color="dark" onClick={handleScanForBarcode}>
                    <IonIcon icon={barcodeOutline} />
                  </IonButton>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Kategorya:</label>
                <IonSelect
                  value={category}
                  onIonChange={(e) => setCategory(e.detail.value)}
                  style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '4px 8px', marginTop: '4px' }}
                >
                  {CATEGORIES.filter((c) => c !== 'Lahat').map((c) => (
                    <IonSelectOption key={c} value={c}>
                      {c}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Puhunan (₱):</label>
                  <IonInput
                    type="number"
                    value={costPrice || ''}
                    placeholder="0.00"
                    onIonInput={(e) => setCostPrice(parseFloat(e.detail.value || '0'))}
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', marginTop: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Benta (₱):</label>
                  <IonInput
                    type="number"
                    value={sellingPrice || ''}
                    placeholder="0.00"
                    onIonInput={(e) => setSellingPrice(parseFloat(e.detail.value || '0'))}
                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', marginTop: '4px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Kasalukuyang Stock (Total Pcs):</label>
                <IonInput
                  type="number"
                  value={stockQty || ''}
                  placeholder="0"
                  onIonInput={(e) => setStockQty(parseInt(e.detail.value || '0'))}
                  style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', marginTop: '4px' }}
                />
              </div>

              {/* Tingi Feature Switch */}
              <div
                style={{
                  background: '#f1f5f9',
                  borderRadius: '10px',
                  padding: '12px',
                  marginTop: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Ibinebenta ba nang Tingi?</span>
                  <IonToggle checked={allowTingi} onIonChange={(e) => setAllowTingi(e.detail.checked)} />
                </div>

                {allowTingi && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Ilang piraso sa isang mother pack?</label>
                      <IonInput
                        type="number"
                        value={piecesPerPack || ''}
                        placeholder="12"
                        onIonInput={(e) => setPiecesPerPack(parseInt(e.detail.value || '12'))}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '4px 8px', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Presyo kada pirasong tingi (₱):</label>
                      <IonInput
                        type="number"
                        value={tingiPrice || ''}
                        placeholder="0.00"
                        onIonInput={(e) => setTingiPrice(parseFloat(e.detail.value || '0'))}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '4px 8px', marginTop: '4px' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '20px' }}>
                <IonButton expand="block" color="primary" onClick={handleSaveProduct} style={{ '--border-radius': '10px', fontWeight: 700 }}>
                  I-save ang Paninda
                </IonButton>
                <IonButton expand="block" fill="clear" color="medium" onClick={() => setShowModal(false)}>
                  Kanselahin
                </IonButton>
              </div>
            </div>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};