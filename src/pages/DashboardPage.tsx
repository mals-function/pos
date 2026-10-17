// src/pages/DashboardPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonBadge,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonModal,
  IonButton,
  IonSearchbar,
  useIonToast,
} from '@ionic/react';
import {
  cashOutline,
  phonePortraitOutline,
  trendingUpOutline,
  alertCircleOutline,
  receiptOutline,
  flameOutline,
  timeOutline,
  refreshOutline,
  shareSocialOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  cartOutline,
  pricetagOutline,
  cubeOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { initStorage, getLocalProducts, quickUpdateStockLocalAndSync } from '../services/dbService';
import { Product, SaleTransaction } from '../types';

export const DashboardPage: React.FC = () => {
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [timeframe, setTimeframe] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  
  // Interactive filters
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'GCASH'>('ALL');
  const [topSellerSort, setTopSellerSort] = useState<'qty' | 'revenue'>('qty');
  const [lowStockFilter, setLowStockFilter] = useState<'ALL' | 'OUT' | 'CRITICAL'>('ALL');
  const [txSearchQuery, setTxSearchQuery] = useState('');

  // Selected Transaction for Inspection Modal
  const [selectedTx, setSelectedTx] = useState<SaleTransaction | null>(null);

  const [presentToast] = useIonToast();

  useEffect(() => {
    loadDashboardMetrics();
  }, []);

  const loadDashboardMetrics = async () => {
    const store = await initStorage();
    const txList: SaleTransaction[] = (await store.get('transactions')) || [];
    const prodList: Product[] = await getLocalProducts();

    setTransactions(txList);
    setProducts(prodList);
  };

  const handleRefresh = async (event?: CustomEvent) => {
    await loadDashboardMetrics();
    if (event) {
      event.detail.complete();
    } else {
      presentToast({
        message: 'Na-update ang ulat ng tindahan!',
        duration: 1500,
        color: 'success',
        position: 'top',
      });
    }
  };

  // Quick 1-tap restock directly from Dashboard
  const handleQuickRestock = async (productId: string, productName: string, qty: number = 12) => {
    await quickUpdateStockLocalAndSync(productId, qty);
    await loadDashboardMetrics();
    presentToast({
      message: `+${qty} pcs naidagdag sa ${productName}!`,
      duration: 2000,
      color: 'success',
      position: 'top',
    });
  };

  // Filtered transactions based on selected timeframe
  const filteredTx = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (timeframe === 'today') {
      return transactions.filter((t) => t.timestamp >= todayStart);
    }

    if (timeframe === 'yesterday') {
      const yesterdayStart = todayStart - oneDayMs;
      return transactions.filter((t) => t.timestamp >= yesterdayStart && t.timestamp < todayStart);
    }

    if (timeframe === 'week') {
      const sevenDaysAgo = Date.now() - 7 * oneDayMs;
      return transactions.filter((t) => t.timestamp >= sevenDaysAgo);
    }

    if (timeframe === 'month') {
      const thirtyDaysAgo = Date.now() - 30 * oneDayMs;
      return transactions.filter((t) => t.timestamp >= thirtyDaysAgo);
    }

    return transactions;
  }, [transactions, timeframe]);

  // Analytics Metrics Calculation
  const metrics = useMemo(() => {
    let totalSales = 0;
    let totalCost = 0;
    let cashSales = 0;
    let gcashSales = 0;
    let totalItemsSold = 0;
    const productSalesMap: { [productId: string]: { name: string; qty: number; revenue: number; profit: number } } = {};

    filteredTx.forEach((tx) => {
      totalSales += tx.totalAmount;

      if (tx.paymentMethod === 'GCASH') {
        gcashSales += tx.totalAmount;
      } else {
        cashSales += tx.totalAmount;
      }

      tx.items.forEach((item) => {
        totalItemsSold += item.quantity;
        const prod = products.find((p) => p.id === item.product.id) || item.product;
        const itemCost = item.isTingi
          ? (prod.costPrice / (prod.piecesPerPack || 1)) * item.quantity
          : prod.costPrice * item.quantity;

        totalCost += itemCost;
        const itemProfit = Math.max(0, item.subtotal - itemCost);

        if (!productSalesMap[prod.id]) {
          productSalesMap[prod.id] = { name: prod.name, qty: 0, revenue: 0, profit: 0 };
        }
        productSalesMap[prod.id].qty += item.quantity;
        productSalesMap[prod.id].revenue += item.subtotal;
        productSalesMap[prod.id].profit += itemProfit;
      });
    });

    const netProfit = Math.max(0, totalSales - totalCost);
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
    const averageBasket = filteredTx.length > 0 ? totalSales / filteredTx.length : 0;

    const cashPercentage = totalSales > 0 ? Math.round((cashSales / totalSales) * 100) : 0;
    const gcashPercentage = totalSales > 0 ? 100 - cashPercentage : 0;

    // Top bestsellers sorted by qty or revenue
    const sortedSellers = Object.values(productSalesMap).sort((a, b) =>
      topSellerSort === 'qty' ? b.qty - a.qty : b.revenue - a.revenue
    );

    return {
      totalSales,
      netProfit,
      profitMargin,
      cashSales,
      gcashSales,
      cashPercentage,
      gcashPercentage,
      totalItemsSold,
      averageBasket,
      txCount: filteredTx.length,
      topSellers: sortedSellers.slice(0, 5),
    };
  }, [filteredTx, products, topSellerSort]);

  // Inventory Asset Value
  const inventoryValue = useMemo(() => {
    let totalStock = 0;
    let totalCost = 0;
    let totalRetail = 0;

    products.forEach((p) => {
      totalStock += p.stockQty;
      totalCost += p.costPrice * p.stockQty;
      totalRetail += p.sellingPrice * p.stockQty;
    });

    return {
      totalStock,
      totalCost,
      totalRetail,
      potentialProfit: Math.max(0, totalRetail - totalCost),
    };
  }, [products]);

  // Low stock products filtered
  const lowStockItems = useMemo(() => {
    return products.filter((p) => {
      if (p.stockQty > 5) return false;
      if (lowStockFilter === 'OUT') return p.stockQty === 0;
      if (lowStockFilter === 'CRITICAL') return p.stockQty > 0 && p.stockQty <= 5;
      return true;
    });
  }, [products, lowStockFilter]);

  // Filtered transactions for recent list
  const displayTransactions = useMemo(() => {
    return filteredTx
      .filter((tx) => {
        if (paymentFilter === 'CASH' && tx.paymentMethod === 'GCASH') return false;
        if (paymentFilter === 'GCASH' && tx.paymentMethod !== 'GCASH') return false;

        if (txSearchQuery.trim()) {
          const q = txSearchQuery.toLowerCase();
          const matchesId = tx.id.toLowerCase().includes(q);
          const matchesItem = tx.items.some((i) => i.product.name.toLowerCase().includes(q));
          return matchesId || matchesItem;
        }

        return true;
      })
      .slice(0, 15);
  }, [filteredTx, paymentFilter, txSearchQuery]);

  // Interactive Sales Activity Bars (Hourly buckets for Today or Daily buckets for Week)
  const activityChartData = useMemo(() => {
    if (timeframe === 'today' || timeframe === 'yesterday') {
      const buckets = [
        { label: '6am-9am', count: 0, amount: 0 },
        { label: '9am-12pm', count: 0, amount: 0 },
        { label: '12pm-3pm', count: 0, amount: 0 },
        { label: '3pm-6pm', count: 0, amount: 0 },
        { label: '6pm-9pm', count: 0, amount: 0 },
        { label: '9pm-12am', count: 0, amount: 0 },
      ];

      filteredTx.forEach((tx) => {
        const hour = new Date(tx.timestamp).getHours();
        let idx = 0;
        if (hour >= 6 && hour < 9) idx = 0;
        else if (hour >= 9 && hour < 12) idx = 1;
        else if (hour >= 12 && hour < 15) idx = 2;
        else if (hour >= 15 && hour < 18) idx = 3;
        else if (hour >= 18 && hour < 21) idx = 4;
        else idx = 5;

        buckets[idx].count += 1;
        buckets[idx].amount += tx.totalAmount;
      });

      const maxAmount = Math.max(...buckets.map((b) => b.amount), 1);
      return { buckets, maxAmount, type: 'hourly' };
    } else {
      // 7 Days breakdown
      const dayNames = ['Lin', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab'];
      const last7Days: { label: string; amount: number; count: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;

        const dayTx = filteredTx.filter((t) => t.timestamp >= dayStart && t.timestamp < dayEnd);
        const dayTotal = dayTx.reduce((acc, curr) => acc + curr.totalAmount, 0);

        last7Days.push({
          label: i === 0 ? 'Ngayon' : dayNames[d.getDay()],
          amount: dayTotal,
          count: dayTx.length,
        });
      }

      const maxAmount = Math.max(...last7Days.map((b) => b.amount), 1);
      return { buckets: last7Days, maxAmount, type: 'daily' };
    }
  }, [filteredTx, timeframe]);

  // Copy Store Daily Report Summary to Clipboard
  const handleCopyReportSummary = async () => {
    const timeframeLabel =
      timeframe === 'today'
        ? 'NGAYONG ARAW'
        : timeframe === 'yesterday'
        ? 'KAHAPON'
        : timeframe === 'week'
        ? 'HULING 7 ARAW'
        : timeframe === 'month'
        ? 'HULING 30 ARAW'
        : 'LAHAT NG PANAHON';

    const text = `
🏪 5M SARI-SARI STORE - ULAT NG BENTA
-----------------------------------
Panahon: ${timeframeLabel}
Petsa: ${new Date().toLocaleDateString('fil-PH', { dateStyle: 'long' })}
-----------------------------------
💰 Kabuuang Benta: ₱${metrics.totalSales.toFixed(2)}
📈 Tantyang Tubo (Profit): ₱${metrics.netProfit.toFixed(2)} (${metrics.profitMargin.toFixed(1)}%)
🧾 Bilang ng Transaksyon: ${metrics.txCount}
📦 Kabuuang Piraso Nabenta: ${metrics.totalItemsSold} pcs
💵 Cash: ₱${metrics.cashSales.toFixed(2)} (${metrics.cashPercentage}%)
📱 GCash: ₱${metrics.gcashSales.toFixed(2)} (${metrics.gcashPercentage}%)
-----------------------------------
⭐ TOP 3 PANINDA:
${metrics.topSellers
  .slice(0, 3)
  .map((s, idx) => `${idx + 1}. ${s.name} - ${s.qty} pcs (₱${s.revenue.toFixed(2)})`)
  .join('\n') || 'Walang naitalang paninda'}
-----------------------------------
Inihanda gamit ang 5M Sari-Sari POS App
`.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: '5M Sari-Sari Store Ulat',
          text,
        });
      } catch (e) {
        // Ignored
      }
    } else {
      await navigator.clipboard.writeText(text);
      presentToast({
        message: 'Kopya na ang buod ng ulat sa clipboard!',
        duration: 2500,
        color: 'success',
        position: 'top',
      });
    }
  };

  return (
    <IonPage>
      {/* Modern Branded Header */}
      <IonHeader className="ion-no-border">
        <IonToolbar style={{ '--background': '#0f172a', '--color': '#fff', padding: '6px 8px' } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src="/assets/logo/icon-5m.svg"
                alt="5M Logo"
                style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'contain' }}
              />
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.08rem', letterSpacing: '-0.3px', lineHeight: 1.1, color: '#fff' }}>
                  5M Sari-Sari Store
                </div>
                <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, letterSpacing: '0.6px' }}>
                  ULAT AT ANALYTICS
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => handleRefresh()}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#38bdf8',
                  borderRadius: '10px',
                  padding: '7px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <IonIcon icon={refreshOutline} />
                Refresh
              </button>
            </div>
          </div>
        </IonToolbar>

        {/* Timeframe Filter Tabs */}
        <div style={{ background: '#0f172a', padding: '0 14px 12px 14px' }}>
          <IonSegment
            value={timeframe}
            onIonChange={(e) => setTimeframe(e.detail.value as any)}
            style={{ '--background': '#1e293b', '--indicator-color': '#38bdf8' } as React.CSSProperties}
          >
            <IonSegmentButton value="today">
              <IonLabel style={{ fontWeight: 700, fontSize: '0.76rem', color: timeframe === 'today' ? '#0f172a' : '#94a3b8' }}>
                Ngayon
              </IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="yesterday">
              <IonLabel style={{ fontWeight: 700, fontSize: '0.76rem', color: timeframe === 'yesterday' ? '#0f172a' : '#94a3b8' }}>
                Kahapon
              </IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="week">
              <IonLabel style={{ fontWeight: 700, fontSize: '0.76rem', color: timeframe === 'week' ? '#0f172a' : '#94a3b8' }}>
                7 Araw
              </IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="month">
              <IonLabel style={{ fontWeight: 700, fontSize: '0.76rem', color: timeframe === 'month' ? '#0f172a' : '#94a3b8' }}>
                30 Araw
              </IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="all">
              <IonLabel style={{ fontWeight: 700, fontSize: '0.76rem', color: timeframe === 'all' ? '#0f172a' : '#94a3b8' }}>
                Lahat
              </IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>
      </IonHeader>

      <IonContent style={{ '--background': '#f8fafc' } as React.CSSProperties}>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div style={{ padding: '14px 14px 40px 14px' }}>
          {/* Quick Actions & Live Summary Banner */}
          <div
            style={{
              background: '#fff',
              borderRadius: '14px',
              padding: '12px 14px',
              marginBottom: '12px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>🏪</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                  {timeframe === 'today' ? 'Benta Ngayong Araw' : 'Buod ng Ulat'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Average kada customer: <b>₱{metrics.averageBasket.toFixed(2)}</b>
                </div>
              </div>
            </div>

            <button
              onClick={handleCopyReportSummary}
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <IonIcon icon={shareSocialOutline} />
              I-share
            </button>
          </div>

          {/* Key Figures Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Total Sales Card */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#fff',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                  Kabuuan ng Benta
                </span>
                <span style={{ fontSize: '1rem' }}>💰</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#38bdf8', marginTop: '6px' }}>
                ₱{metrics.totalSales.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '6px' }}>
                <b>{metrics.txCount}</b> transaksyon • <b>{metrics.totalItemsSold}</b> pcs
              </div>
            </div>

            {/* Estimated Net Profit (Tubo) Card */}
            <div
              style={{
                background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
                color: '#fff',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 4px 14px rgba(6,78,59,0.18)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.76rem', color: '#a7f3d0', fontWeight: 700, textTransform: 'uppercase' }}>
                  Tantyang Tubo
                </span>
                <span style={{ fontSize: '1rem' }}>📈</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#4ade80', marginTop: '6px' }}>
                ₱{metrics.netProfit.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#dcfce7', marginTop: '6px' }}>
                Margin: <b>{metrics.profitMargin.toFixed(1)}%</b>{' '}
                {metrics.profitMargin >= 25 && <span style={{ color: '#fef08a' }}>★ Malusog</span>}
              </div>
            </div>
          </div>

          {/* Interactive Payment Method Split (Cash vs GCash) */}
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '14px 16px',
              marginTop: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                Paraan ng Bayad (Payment Split)
              </span>
              <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                I-tap para mag-filter
              </span>
            </div>

            {/* Visual Dual Progress Bar */}
            <div style={{ width: '100%', height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden', display: 'flex', marginBottom: '12px' }}>
              <div style={{ width: `${metrics.cashPercentage}%`, background: '#16a34a', transition: 'width 0.3s ease' }} />
              <div style={{ width: `${metrics.gcashPercentage}%`, background: '#005CE6', transition: 'width 0.3s ease' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Cash Filter Button */}
              <button
                onClick={() => setPaymentFilter(paymentFilter === 'CASH' ? 'ALL' : 'CASH')}
                style={{
                  border: paymentFilter === 'CASH' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                  background: paymentFilter === 'CASH' ? '#f0fdf4' : '#fff',
                  borderRadius: '12px',
                  padding: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IonIcon icon={cashOutline} style={{ color: '#16a34a', fontSize: '1.1rem' }} />
                  <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 700 }}>
                    Cash ({metrics.cashPercentage}%)
                  </span>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                  ₱{metrics.cashSales.toFixed(2)}
                </div>
              </button>

              {/* GCash Filter Button */}
              <button
                onClick={() => setPaymentFilter(paymentFilter === 'GCASH' ? 'ALL' : 'GCASH')}
                style={{
                  border: paymentFilter === 'GCASH' ? '2px solid #005CE6' : '1px solid #e2e8f0',
                  background: paymentFilter === 'GCASH' ? '#eff6ff' : '#fff',
                  borderRadius: '12px',
                  padding: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IonIcon icon={phonePortraitOutline} style={{ color: '#005CE6', fontSize: '1.1rem' }} />
                  <span style={{ fontSize: '0.78rem', color: '#005CE6', fontWeight: 700 }}>
                    GCash ({metrics.gcashPercentage}%)
                  </span>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#005CE6', marginTop: '4px' }}>
                  ₱{metrics.gcashSales.toFixed(2)}
                </div>
              </button>
            </div>
          </div>

          {/* Interactive Sales Activity Bar Chart */}
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '14px 16px',
              marginTop: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IonIcon icon={trendingUpOutline} style={{ color: '#0284c7', fontSize: '1.1rem' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                  {activityChartData.type === 'hourly' ? 'Oras ng Pagdagsa ng Mamimili (Hourly)' : 'Benta Kada Araw'}
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Aktibidad</span>
            </div>

            {/* Bar Chart Visualization */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '120px', gap: '6px', paddingTop: '10px' }}>
              {activityChartData.buckets.map((b, idx) => {
                const heightPercent = Math.max(8, Math.round((b.amount / activityChartData.maxAmount) * 100));
                const isPeak = b.amount === activityChartData.maxAmount && b.amount > 0;

                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {b.amount > 0 && (
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: isPeak ? '#0284c7' : '#64748b', marginBottom: '2px' }}>
                        ₱{Math.round(b.amount)}
                      </span>
                    )}
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPercent}%`,
                        background: isPeak ? 'linear-gradient(180deg, #38bdf8, #0284c7)' : '#e2e8f0',
                        borderRadius: '6px 6px 2px 2px',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span style={{ fontSize: '0.65rem', color: isPeak ? '#0f172a' : '#64748b', fontWeight: isPeak ? 800 : 600, marginTop: '6px', textAlign: 'center' }}>
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Top Best-Selling Products Leaderboard */}
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IonIcon icon={flameOutline} style={{ color: '#ea580c', fontSize: '1.2rem' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                  Pinakamabentang Paninda (Top 5)
                </span>
              </div>

              {/* Sort Toggle */}
              <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '2px', borderRadius: '8px' }}>
                <button
                  onClick={() => setTopSellerSort('qty')}
                  style={{
                    border: 'none',
                    background: topSellerSort === 'qty' ? '#0f172a' : 'transparent',
                    color: topSellerSort === 'qty' ? '#fff' : '#64748b',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Dami (Qty)
                </button>
                <button
                  onClick={() => setTopSellerSort('revenue')}
                  style={{
                    border: 'none',
                    background: topSellerSort === 'revenue' ? '#0f172a' : 'transparent',
                    color: topSellerSort === 'revenue' ? '#fff' : '#64748b',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    padding: '3px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Halaga (₱)
                </button>
              </div>
            </div>

            {metrics.topSellers.length === 0 ? (
              <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                Wala pang naitalang benta sa panahong ito.
              </div>
            ) : (
              metrics.topSellers.map((item, idx) => {
                const revenueShare = metrics.totalSales > 0 ? (item.revenue / metrics.totalSales) * 100 : 0;
                const medalColors = ['#f59e0b', '#94a3b8', '#b45309'];

                return (
                  <div
                    key={idx}
                    style={{
                      background: '#fff',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      marginBottom: '8px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            background: idx < 3 ? medalColors[idx] : '#f1f5f9',
                            color: idx < 3 ? '#fff' : '#475569',
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '0.78rem',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>{item.name}</div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                            Nabenta: <b>{item.qty} piraso</b> • Tubo: <b style={{ color: '#16a34a' }}>+₱{item.profit.toFixed(2)}</b>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 900, color: '#16a34a', fontSize: '1rem' }}>
                          ₱{item.revenue.toFixed(2)}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#0284c7', fontWeight: 700 }}>
                          {revenueShare.toFixed(1)}% ng benta
                        </span>
                      </div>
                    </div>

                    {/* Mini Contribution Bar */}
                    <div style={{ width: '100%', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', marginTop: '8px' }}>
                      <div style={{ width: `${revenueShare}%`, height: '100%', background: '#38bdf8' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Interactive Low Stock Alert Hub with 1-Tap Restock */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IonIcon icon={alertCircleOutline} style={{ color: '#dc2626', fontSize: '1.2rem' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                  Babala sa Mababang Stock ({lowStockItems.length})
                </span>
              </div>

              {/* Low Stock Filter Chips */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setLowStockFilter('ALL')}
                  style={{
                    border: 'none',
                    background: lowStockFilter === 'ALL' ? '#ef4444' : '#fee2e2',
                    color: lowStockFilter === 'ALL' ? '#fff' : '#b91c1c',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  Lahat
                </button>
                <button
                  onClick={() => setLowStockFilter('OUT')}
                  style={{
                    border: 'none',
                    background: lowStockFilter === 'OUT' ? '#b91c1c' : '#f1f5f9',
                    color: lowStockFilter === 'OUT' ? '#fff' : '#64748b',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  Ubos (0)
                </button>
              </div>
            </div>

            {lowStockItems.length === 0 ? (
              <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', color: '#16a34a', fontSize: '0.85rem', textAlign: 'center', fontWeight: 700, border: '1px solid #dcfce7' }}>
                ✓ Ligtas! May sapat pang stock ang lahat ng paninda.
              </div>
            ) : (
              lowStockItems.slice(0, 6).map((prod) => (
                <div
                  key={prod.id}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    marginBottom: '8px',
                    borderLeft: prod.stockQty === 0 ? '5px solid #dc2626' : '5px solid #f59e0b',
                    borderTop: '1px solid #f1f5f9',
                    borderRight: '1px solid #f1f5f9',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>{prod.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      Barcode: <code>{prod.barcode}</code>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IonBadge color={prod.stockQty === 0 ? 'danger' : 'warning'} style={{ padding: '6px 10px', borderRadius: '8px', fontWeight: 800 }}>
                      {prod.stockQty} pcs
                    </IonBadge>

                    {/* Quick Restock Button */}
                    <button
                      onClick={() => handleQuickRestock(prod.id, prod.name, 12)}
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        color: '#1d4ed8',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      +12 Restock
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Interactive Recent Transactions Explorer */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IonIcon icon={timeOutline} style={{ color: '#0284c7', fontSize: '1.2rem' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                  Kamakailang Transaksyon ({displayTransactions.length})
                </span>
              </div>

              {paymentFilter !== 'ALL' && (
                <button
                  onClick={() => setPaymentFilter('ALL')}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    color: '#0f172a',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  I-reset Filter ✕
                </button>
              )}
            </div>

            {/* Quick Filter Searchbar */}
            <IonSearchbar
              value={txSearchQuery}
              placeholder="Hanapin sa Tx ID o pangalan ng item..."
              onIonInput={(e) => setTxSearchQuery(e.detail.value || '')}
              style={{
                '--background': '#fff',
                '--border-radius': '12px',
                '--box-shadow': 'none',
                padding: '0 0 8px 0',
              } as React.CSSProperties}
            />

            {displayTransactions.length === 0 ? (
              <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                Walang nakitang transaksyon.
              </div>
            ) : (
              displayTransactions.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    marginBottom: '8px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                        {tx.id}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                        {tx.items.length} item ({tx.items.reduce((a, b) => a + b.quantity, 0)} pcs)
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.05rem' }}>
                        ₱{tx.totalAmount.toFixed(2)}
                      </div>
                      <IonBadge
                        color={tx.paymentMethod === 'GCASH' ? 'tertiary' : 'light'}
                        style={{ fontSize: '0.7rem', fontWeight: 700, marginTop: '2px' }}
                      >
                        {tx.paymentMethod || 'CASH'}
                      </IonBadge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal: Detailed Transaction / Receipt Inspector */}
        <IonModal isOpen={!!selectedTx} onDidDismiss={() => setSelectedTx(null)}>
          {selectedTx && (
            <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <img
                  src="/assets/logo/logo-horizontal-5m.svg"
                  alt="5M Sari-Sari Store"
                  style={{ height: '42px', marginBottom: '10px' }}
                />
                <h2 style={{ margin: 0, fontWeight: 900, color: '#0f172a' }}>Detalye ng Resibo</h2>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Tx ID: {selectedTx.id}</span>
              </div>

              {/* Receipt Content Card */}
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
                    <b style={{ color: selectedTx.paymentMethod === 'GCASH' ? '#005CE6' : '#16a34a' }}>
                      {selectedTx.paymentMethod || 'CASH'}
                    </b>
                  </div>
                  {selectedTx.referenceNumber && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#0284c7' }}>
                      <span>GCash Ref #:</span>
                      <b>{selectedTx.referenceNumber}</b>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>
                    <span>Oras at Petsa:</span>
                    <span>{new Date(selectedTx.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {/* Items List */}
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {selectedTx.items.map((it, i) => (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 900, color: '#16a34a' }}>
                    <span>Kabuuan:</span>
                    <span>₱{selectedTx.totalAmount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>
                    <span>Bayad:</span>
                    <span>₱{selectedTx.cashReceived.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>
                    <span>Sukli:</span>
                    <span>₱{selectedTx.changeGiven.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                <IonButton expand="block" color="dark" onClick={() => setSelectedTx(null)} style={{ '--border-radius': '12px', fontWeight: 700 }}>
                  Isara
                </IonButton>
              </div>
            </div>
          )}
        </IonModal>
      </IonContent>
    </IonPage>
  );
};