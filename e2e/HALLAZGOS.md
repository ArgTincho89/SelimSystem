# Hallazgos detectados durante el desarrollo de la suite E2E

> Estos defectos están en el código de la aplicación (`src/`, `public/`). No fueron corregidos porque el alcance de Patesi en SelimSystem es solo lectura fuera de `e2e/`.

## H-01: Goals no tiene endpoint PUT/PATCH para edición

**Archivo:** `src/routes/goals.js`
**Riesgo:** Medio-Alto

El backend solo expone `GET /`, `POST /` y `DELETE /:id`. El changelog del frontend menciona:

- v1.6.1: "Botón de editar meta agregado"
- v1.6.0: "Página Metas con selector de meses y CRUD completo"

Sin embargo, no existe endpoint para actualizar una meta existente. Si el frontend invoca edición, fallará con `404`.

**Evidencia:** líneas 7-99 de `src/routes/goals.js` solo definen GET, POST y DELETE.

**Recomendación:** agregar `PUT /:id` (o `PATCH /:id`) con las mismas validaciones del POST.

---

## H-02: Mensaje de error confuso al crear ingreso Mixto sin montos A/B

**Archivo:** `src/routes/transactions.js`
**Riesgo:** Bajo (UX)

En el POST de transacciones, si se envía `tipo: 'income'`, `clasificacion: 'Mixto'` pero sin `montoA`/`montoB`, el flujo entra por la condición de la línea 91:

```js
if (montoA !== undefined || montoB !== undefined) { ... }
```

Como ambos son `undefined`, no entra ahí, pero tampoco entra al `else if` de la línea 95 (`clasificacion === 'Mixto'`) si se envían montos `undefined`? Sí entra: el else if de la línea 95 verifica `clasificacion === 'Mixto'` y devuelve el mensaje correcto. Verifiqué de nuevo: si `montoA` y `montoB` son undefined, la condición de la línea 91 es falsa, entonces evalúa el `else if (clasificacion === 'Mixto')` de la línea 95 y devuelve "La clasificación Mixto requiere importes A y B". OK, no es un defecto real.

**Actualización:** este hallazgo fue invalidado tras relectura. No se reporta.

---

## H-05: Transacciones recurrentes creadas el día 31 no se reconocen en el mes actual

**Archivo:** `src/utils/recurring.js`
**Riesgo:** Alto

Si una transacción recurrente se crea con fecha `2026-08-31` y se consulta el total recurrente para `2026-08`, `generateRecurringInstances` retorna un array vacío, por lo que `/api/transactions/recurring-total` devuelve `total: 0`.

**Causa:** la función mezcla parseo de fecha en UTC (`new Date(tx.fecha)`) con construcción de fecha en hora local (`new Date(targetYear, targetMonth - 1, startDate.getDate())`). En zonas horarias negativas, `startDate.getDate()` puede devolver `30` para una transacción creada el día 31, generando una `targetDate` anterior a `startDate` y produciendo `return []`.

**Evidencia de reproducción:**

```powershell
POST /api/transactions { tipo: "expense", titulo: "Alquiler", monto: 800, recurrente: true, frecuencia: "monthly", fecha: "2026-08-31" }
GET  /api/transactions/recurring-total?month=2026-08
# Respuesta: { "month": "2026-08", "total": 0, "items": [] }
```

**Recomendación:** normalizar ambas fechas al mismo sistema (UTC o local) o usar comparación de componentes año/mes/día sin depender de objetos `Date`.

---

## H-03: Eliminar categoría padre deja subcategorías huérfanas

**Archivo:** `src/routes/categories.js`
**Riesgo:** Medio

El endpoint `DELETE /:id` verifica que la categoría no tenga transacciones asociadas, pero no valida si tiene hijas. Al eliminar el padre, las subcategorías quedan con `parentId` apuntando a una categoría inexistente.

**Evidencia:** líneas 85-103 de `src/routes/categories.js`.

**Recomendación:**
- Opción A: rechazar la eliminación si la categoría tiene hijas (similar a transacciones).
- Opción B: eliminar en cascada las subcategorías hijas (con las validaciones correspondientes).

---

## H-04: `/version.json` no está servido explícitamente

**Archivo:** `public/js/pages/login.js`, `src/app.js`
**Riesgo:** Bajo

El login hace `fetch('/version.json')` para mostrar la versión en el changelog. Si el archivo no existe en `public/version.json`, el catch silencioso usa la versión hardcodeada `1.11.2`, lo que puede mostrar una versión desactualizada.

**Evidencia:** `login.js` líneas 9-12.

**Recomendación:** generar `public/version.json` durante el build o servir un endpoint `/api/version` que lea `package.json`.

---

## Riesgos de testing identificados

1. **CORS en CI/local:** `config.appUrl` default es `http://localhost:3000`. Si el servidor de tests corre en `3001`, la configuración CORS en `app.js` permite solo `config.appUrl`. Sin embargo, el frontend usa `credentials: 'same-origin'`, por lo que no debería haber preflight cross-origin si UI y API están en el mismo origen. Aún así, validar que `APP_URL` se setee correctamente en CI.

2. **Sesiones en disco (`connect-loki`):** el store de sesiones es persistente en `DATA_DIR`. Si no se limpia entre runs, podría haber sesiones residuales. La suite usa `DATA_DIR` aislado y cada test crea/borra usuario, pero recomendamos limpiar `e2e/reports/e2e-data` antes de cada run en CI.

3. **Tests paralelos:** actualmente `workers: 1` en CI para evitar contaminación de datos entre usuarios. Una vez que se valide la independencia, se puede evaluar aumentar workers.

4. **Selectores de UI frágiles:** algunos Page Objects dependen de textos visibles (ej. "Guardar", "Cerrar sesión"). Si cambian, los tests UI fallarán. Se recomienda agregar `data-testid` en el frontend para selectores estables.
