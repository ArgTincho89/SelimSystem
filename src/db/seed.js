const DEFAULT_CATEGORIES = [
  { nombre: 'Supermercado', color: '#FF6B6B', orden: 1 },
  { nombre: 'Transporte', color: '#4ECDC4', orden: 2 },
  { nombre: 'Entretenimiento', color: '#FFE66D', orden: 3 },
  { nombre: 'Salud', color: '#95E1D3', orden: 4 },
  { nombre: 'Educación', color: '#AA96DA', orden: 5 },
  { nombre: 'Hogar', color: '#F38181', orden: 6 },
  { nombre: 'Gastos varios', color: '#A8D8EA', orden: 7 }
];

function seedCategories(db, userId) {
  const categories = DEFAULT_CATEGORIES.map(cat => ({
    id: require('uuid').v4(),
    userId,
    nombre: cat.nombre,
    color: cat.color,
    orden: cat.orden,
    createdAt: new Date().toISOString()
  }));

  const filePath = db._filePath('categories', userId);
  db._writeFile(filePath, categories);
  db._invalidateCache('categories', userId);

  return categories;
}

module.exports = { seedCategories, DEFAULT_CATEGORIES };
