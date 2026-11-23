# Simulación de la ruta M502 de MetroBus de Panamá

**Análisis de las demoras en la llegada de los autobuses**

## 1. Descripción del proyecto

Simulación interactiva de eventos discretos de la ruta **M502 de MetroBus** en sentido Mañanitas, desde la **Estación Marañón – Bahía 14** hasta **Calle Peña Blanca-R**, durante el período de 5:00 a. m. a 9:00 a. m.

El modelo representa la llegada aleatoria de pasajeros a las paradas, el despacho de autobuses desde el origen, el viaje entre paradas, el descenso y abordaje de pasajeros con capacidad limitada, y el cierre del sistema cuando todos los autobuses terminan el recorrido. Permite comparar el intervalo actual de despacho (cada 20 minutos) con un intervalo alternativo (cada 15 minutos).

Esta aplicación web es una implementación del diseño conceptual del proyecto. Sirve como complemento del modelo en FlexSim para visualizar el sistema, verificar la lógica y ejecutar las réplicas experimentales.

## 2. Integrantes

**Universidad:** Universidad Interamericana de Panamá
**Profesora:** Luz Pascual

- Georgina Hanna
- Kevin Gonzalez

## 3. Objetivo general

Simular la operación de la ruta M502 para analizar los tiempos de espera de los pasajeros, la formación de colas en las paradas y el efecto de la frecuencia de despacho sobre el servicio.

## 4. Tecnologías utilizadas

- **HTML5 y Tailwind CSS:** estructura e interfaz.
- **JavaScript:** motor de simulación de eventos discretos ([js/motor-simulacion.js](js/motor-simulacion.js)).
- **Three.js:** vista 3D esquemática de la ruta, las paradas, las colas y los autobuses.
- **Chart.js:** gráficas de colas y comparación de escenarios.

## 5. Descripción del sistema

### 5.1. Ubicaciones

| Código | Ubicación | Función | Descenso |
|---|---|---|---:|
| L1 | Estación Marañón – Bahía 14 | Origen (despacho) | — |
| L2 | El Dorado-R | Parada 1 | 0 % |
| L3 | Metro Villa Lucre-R | Parada 2 | 20 % |
| L4 | Cerro Viento-R | Parada 3 | 20 % |
| L5 | Las Trancas-R | Parada 4 | 20 % |
| L6 | Calle Peña Blanca-R | Destino final | 100 % |

### 5.2. Reloj de simulación

- Unidad: segundos. `t = 0` corresponde a las 5:00 a. m.
- Llegadas de pasajeros y despachos: `0 ≤ t < 14 400 s` (5:00–9:00 a. m.).
- Después de las 9:00 los autobuses en ruta terminan el recorrido y todavía pueden recoger a quienes esperan.
- La corrida termina cuando todos los autobuses despachados salen de L6.

### 5.3. Recorrido real en la visualización

La vista 3D muestra el recorrido real de la M502 (sentido Tumba Muerto – Mañanitas) sobre un mapa de la ciudad de Panamá:

- **Paradas:** las 53 paradas de la línea, en el orden publicado por Moovit.
- **Coordenadas:** paradas de MiBus registradas en OpenStreetMap. Nueve paradas sin registro (Nueva California, Balmoral, Pazko, Villa Lobos, Los Nogales 2, La Pagoda, Belén, Villa Belén y Las Trancas) se ubicaron de forma aproximada por barrio o calle y se muestran en gris.
- **Trazado por calles:** calculado con OSRM sobre datos de OpenStreetMap: **29.9 km** desde Estación Marañón hasta Calle Peña Blanca.
- **Mapa base:** Esri (calles en gris oscuro o vista satelital).

Las seis ubicaciones del modelo quedan en su kilómetro real del recorrido:

| Código | Parada | Parada n.º (de 53) | km desde L1 |
|---|---|---:|---:|
| L1 | Estación Marañón – Bahía 14 | 1 | 0.0 |
| L2 | El Dorado-R | 12 | 7.1 |
| L3 | Metro Villa Lucre-R | 25 | 15.0 |
| L4 | Cerro Viento-R | 31 | 18.4 |
| L5 | Las Trancas-R | 51 | 28.8 |
| L6 | Calle Peña Blanca-R | 53 | 29.9 |

En el modelo, el autobús solo se detiene en L1–L6; las demás paradas se muestran como referencia. Los datos del recorrido están en [js/ruta-m502.js](js/ruta-m502.js).

## 6. Parámetros de entrada

### 6.1. Escenarios (Tabla 10)

| Escenario | Despachos por hora | Intervalo | Primer despacho | Último despacho | Salidas | Capacidad |
|---|---:|---:|---:|---:|---:|---:|
| Inicial | 3 | 20 min (1 200 s) | 5:00 (0 s) | 8:40 (13 200 s) | 12 | 80 |
| Alternativo | 4 | 15 min (900 s) | 5:00 (0 s) | 8:45 (13 500 s) | 16 | 80 |

Cada escenario se ejecuta con **5 réplicas**.

### 6.2. Llegada de pasajeros (Tabla 12, distribución exponencial)

| Parada | Pasajeros/h | Media entre llegadas |
|---|---:|---:|
| L2 El Dorado-R | 60 | 60 s |
| L3 Metro Villa Lucre-R | 48 | 75 s |
| L4 Cerro Viento-R | 36 | 100 s |
| L5 Las Trancas-R | 24 | 150 s |
| **Total** | **168** | — |

Se esperan en promedio 168 × 4 = **672 pasajeros** en las 4 horas. Son estimaciones académicas.

### 6.3. Tiempos de viaje (Tabla 13, distribución triangular)

| Tramo | Mínimo | Moda | Máximo |
|---|---:|---:|---:|
| L1 → L2 | 12 min | 16 min | 21 min |
| L2 → L3 | 15 min | 20 min | 26 min |
| L3 → L4 | 8 min | 11 min | 12 min |
| L4 → L5 | 10 min | 13 min | 19 min |
| L5 → L6 | 7 min | 9 min | 14 min |
| **Total** | **52 min** | **69 min** | **92 min** |

Se genera un valor independiente por autobús y por tramo. Los tiempos de parada se suman a estos valores.

## 7. Reglas de operación

1. Los autobuses salen vacíos de L1. No hay llegadas de pasajeros en L1.
2. **Descenso:** 0 % en L2; 20 % de la ocupación en L3, L4 y L5, redondeado al entero más cercano (las mitades suben) y sin superar la ocupación; 100 % en L6.
3. **Abordaje:** después del descenso, los asientos disponibles son `80 − ocupación`. Abordan `A = mín(cola al iniciar el abordaje, asientos disponibles)`. El grupo queda fijo al iniciar el abordaje; quien llega después espera el siguiente autobús.
4. **Tiempo en parada:** `10 s + 5 s × A + 3 s × D` (A = abordajes, D = descensos). En L6: `10 s + 3 s × D`.

## 8. Indicadores de salida (Tabla 15)

| Indicador | Cálculo |
|---|---|
| Tiempo promedio de espera | Promedio de (inicio del abordaje − llegada a la cola) ÷ 60, solo pasajeros que abordaron, incluidos los que abordan después de las 9:00. Si nadie aborda se reporta como no disponible. |
| Pasajeros transportados | Conteo de abordajes. |
| Pasajeros no abordados | Suma de las cuatro colas al cierre. |
| Cola máxima por parada | Mayor longitud de cola observada en L2, L3, L4 y L5. |
| Tiempo promedio de recorrido | Promedio de (llegada a L6 − despacho en L1) ÷ 60, incluidos los tiempos de parada. |
| Intervalo programado y observado | 20 o 15 min programado; intervalo observado promedio por parada. |

**Verificaciones de consistencia** que la aplicación revisa en cada corrida:

- Generados = abordados + en cola al cierre.
- Abordados = descensos acumulados de L2 a L6.
- Todos los autobuses salen vacíos de L6.

## 9. Diseño experimental

- 5 réplicas por escenario (10 corridas en total).
- Colas, ocupación, contadores y estadísticas se reinician en cada réplica.
- Cada réplica usa una semilla distinta. La demanda de pasajeros y los tiempos de viaje usan la **misma semilla en ambos escenarios** para la misma réplica (números aleatorios comunes), de modo que la diferencia entre escenarios se debe al intervalo de despacho.
- Se reporta el promedio de cada indicador por escenario.

**Comparación (sección 8.6):**

- Diferencia absoluta = promedio alternativo − promedio inicial.
- Variación porcentual = 100 × (alternativo − inicial) ÷ inicial.
- Si el valor inicial es cero se reporta la diferencia absoluta y se indica que la variación porcentual no aplica.

## 10. Uso de la aplicación

1. Clonar o descargar este repositorio.
2. Abrir `index.html` en un navegador actualizado (Chrome, Edge o Firefox). Se requiere conexión a internet para cargar Tailwind, Three.js y Chart.js.
3. Elegir el **escenario** (Inicial o Alternativo) y la **réplica**.
4. Presionar **Iniciar** para ver la animación. La velocidad se ajusta con el control deslizante.
5. **Completar corrida y ver resultados** termina la réplica actual y muestra sus indicadores, la tabla por parada y las verificaciones.
6. **Ejecutar experimento** corre las 5 réplicas de cada escenario, llena la tabla comparativa (Tabla 16) y permite **descargar un CSV** con los 10 registros y la comparación.

## 11. Estructura del repositorio

```
index.html               Interfaz: vista 3D, paneles y resultados
js/motor-simulacion.js   Motor de eventos discretos, indicadores y experimento
js/ruta-m502.js          Recorrido real: 53 paradas, coordenadas y trazado por calles
README.md
```

El motor también se puede ejecutar sin navegador con Node.js:

```bash
node -e "const M=require('./js/motor-simulacion.js'); console.table(M.runExperiment().comparison)"
```

## 12. Alcance y limitaciones

- No se modelan los vehículos particulares fuera de la ruta ni la infraestructura vial.
- La vista 3D usa el recorrido real, pero los tiempos de viaje del modelo vienen de la Tabla 13 y no de las distancias reales. Por eso el autobús avanza a distinta velocidad en cada tramo (por ejemplo, L5→L6 mide 1.1 km y tiene una moda de 9 min).
- Los autobuses y paradas se dibujan más grandes que su tamaño real para que se vean sobre el mapa.
- Los resultados dependen de los parámetros supuestos de demanda, viaje y servicio. El alcance es académico y los resultados no representan datos oficiales de MiBus.
- Referencias de contexto: MiBus indica una capacidad de 80 personas para los modelos Gran Viale y Torino; Moovit reporta un intervalo de referencia de 27 minutos para la M502. Los intervalos de 20 y 15 minutos son una elección experimental del proyecto.
