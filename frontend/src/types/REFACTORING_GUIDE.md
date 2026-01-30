# Type Definitions Refactoring Guide

## ✅ Kas padaryta

1. Sukurta `frontend/src/types/index.ts` su visais bendrais tipais
2. Eksportuojami visi pagrindiniai tipai: Partner, Order, Invoice, Expense, etc.

## 📋 Kaip refactorinti egzistuojančius failus

### Prieš:
```typescript
// OrdersPage.tsx
interface Order {
  id: number;
  order_number: string;
  // ... 100+ eilučių ...
}

interface CargoItem {
  // ... 20+ eilučių ...
}
```

### Po:
```typescript
// OrdersPage.tsx
import { Order, CargoItem, Partner } from '../types';

// Jei reikia išplėsti tipą specifiškai šiam komponentui:
interface OrderWithExtras extends Order {
  localOnlyField?: string;
}
```

## 🎯 Failai kuriuos reikia refactorinti

### High Priority (daug dubliavimo):
- [x] `types/index.ts` - sukurta
- [ ] `pages/OrdersPage.tsx` - ~150 eilučių tipų
- [ ] `pages/PartnersPage.tsx` - ~30 eilučių tipų
- [ ] `pages/InvoicesPage.tsx` - ~80 eilučių tipų
- [ ] `pages/ExpenseSuppliersPage.tsx` - ~10 eilučių tipų
- [ ] `pages/ExpenseCategoriesPage.tsx` - ~10 eilučių tipų
- [ ] `pages/ExpenseInvoicesPage.tsx` - ~20 eilučių tipų
- [ ] `pages/DashboardPage.tsx` - ~20 eilučių tipų

### Medium Priority:
- [ ] `components/orders/OrderDetailsModal.tsx`
- [ ] `components/orders/OrderEditModal.tsx`
- [ ] `components/invoices/SalesInvoiceDetailsModal.tsx`
- [ ] `components/invoices/SalesInvoiceEditModal.tsx`

### Low Priority (mažai dubliavimo):
- [ ] `pages/SettingsPage.tsx`
- [ ] `pages/BankImportPage.tsx`

## 💡 Best Practices

1. **Import tik tai ko reikia:**
```typescript
import { Order, Partner } from '../types';
// Ne: import * as Types from '../types';
```

2. **Extend jei reikia papildomų laukų:**
```typescript
interface LocalOrder extends Order {
  isSelected?: boolean;
  localError?: string;
}
```

3. **Utility types:**
```typescript
// Jei reikia tik kelių laukų
type OrderSummary = Pick<Order, 'id' | 'order_number' | 'status'>;

// Jei reikia padaryti visus laukus optional
type PartialOrder = Partial<Order>;

// Jei reikia tik skaitymo
type ReadonlyOrder = Readonly<Order>;
```

4. **Generic types su Pagination:**
```typescript
import { PaginatedResponse, Order } from '../types';

const [orders, setOrders] = useState<PaginatedResponse<Order>>();
```

## 🔄 Migration Checklist

Kiekvienam failui:
1. [ ] Identifikuoti kurie tipai jau yra `types/index.ts`
2. [ ] Pridėti import: `import { Order, Partner, ... } from '../types';`
3. [ ] Ištrinti dubliuotus tipo definicijas
4. [ ] Paleisti TypeScript compiler: `npm run build` - patikrinti klaidas
5. [ ] Patikrinti ar komponentas veikia tinkamai

## ⚠️ Known Issues

- `OrdersPage.tsx` turi `Client` interface, kuris iš tikrųjų yra `Partner` - reikės rename'inti
- Kai kuriuose failuose `OtherCost` turi skirtingas struktūras - reikės suvienodinti
- `Contact` tipas turi skirtingus laukus (`first_name`/`last_name` vs `name`) - reikės API alignment

## 📊 Progress Tracking

Total interfaces before: ~350
Total interfaces after: ~50 (centralized) + ~50 (local extensions)
Code reduction: ~80%

