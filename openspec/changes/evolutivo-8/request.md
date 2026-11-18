# Evolutivo 8 — Original user request (Spanish) and decisions

> Branch: `evolutivo-8`. Delivery: PR to master, merge after CI green (user authorized deploy: "Desarrollalo y despliega").

## 1. IVA mensual por titular: débito, crédito y saldo

En la sección inicio, en la parte analítica, hay una parte que se llama IVA mensual por titular. Cuando imputo un ingreso en A a un titular y declaro un porcentaje de IVA, ese IVA debe impactar en esta analítica por titular y mes. La sección se divide en cuatro columnas: titular, débito fiscal, crédito fiscal y saldo. El IVA de un ingreso A es débito fiscal del titular. Cuando realizo un gasto y declaro IVA (debo poder indicar el porcentaje), ese IVA es crédito fiscal del titular. Saldo = crédito fiscal − débito fiscal. Ejemplo: ingreso de 1.000.000 al 21% → débito 210.000; gasto (televisor) de 1.000.000 facturado al titular al 21% → crédito 210.000; saldo 0.

## 2. Etiquetas en los buscadores

El buscador de la sección "Bienes" tiene los campos de búsqueda pero le falta poner labels explicativas arriba de cada uno. Agregar labels explicativas arriba de ese buscador y de todos los que sean similares en toda la aplicación.

## Decisions

- D1: Expense IVA is computed on the expense amount (`monto × r / 100`), matching the user's example; `ivaIncluded` is honored if present.
- D2: The credit goes to the owner chosen in "Factura a nombre de" (`ivaHolderId` + `ivaHolderName` snapshot); empty means the owner of the expense account.
- D3: `ivaByHolder` items now carry `debit`, `credit`, `balance`; `amount` stays as the debit for compatibility.
- D4: Refunds do not accept IVA.
- D5: Filter bars with unlabeled controls (Bienes, Obligaciones, Avisos) use the shared `labeledField` helper. Home "Filtrar", Logs and Períodos filters were already labeled.
