export const TestData = {
  users: {
    defaultPassword: 'Test1234!',
    shortPassword: '12345',
  },
  categories: {
    defaultColor: '#FF6B6B',
    parentName: 'Hogar',
    childName: 'Supermercado',
  },
  transactions: {
    expense: {
      titulo: 'Gasto de prueba',
      monto: 42.5,
      fecha: () => new Date().toISOString().split('T')[0],
    },
    income: {
      titulo: 'Ingreso de prueba',
      monto: 1500,
      clasificacion: 'A',
      fecha: () => new Date().toISOString().split('T')[0],
    },
  },
  goals: {
    ahorro: {
      tipo: 'ahorro_mensual',
      modo: 'monto_fijo',
      montoFijo: 500,
    },
  },
} as const;

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function firstDayOfMonth(month?: string): string {
  return month ? `${month}-01` : `${currentMonth()}-01`;
}

export function addMonthsToMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonthsToDate(dateStr: string, delta: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatEuro(amount: number, signed = false): string {
  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? '-' : signed && amount > 0 ? '+' : '';
  return `${sign}${formatted}€`;
}
